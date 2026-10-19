import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { parseHTML } from 'linkedom'

export async function checkFiles(root: string, files: string[]) {
  const errors: string[] = []
  // Established instruction files and packaged skill references keep their public names.
  const conventionalNames = new Set([
    'AGENTS.md',
    'README.md',
    'SKILL.md',
    'DESIGN.md',
    'TESTING.md',
    'NOTES.md',
    'LICENSE',
    'COLLAB.md',
    'INTENTS.md',
    'SCRATCHPAD.md',
    'UI-COMPONENTS.md',
    '__fixtures__'
  ])
  for (const file of files) {
    if (file.startsWith('client/vendor/')) continue
    for (const part of file.split('/')) {
      if (!conventionalNames.has(part) && !/^\.?[a-z0-9]+(?:[-.][a-z0-9]+)*$/.test(part)) {
        errors.push(`${file}: use kebab-case for "${part}"`)
      }
    }
  }

  const documents = new Map<string, ReturnType<typeof parseHTML>['document']>()
  async function documentAt(path: string) {
    let document = documents.get(path)
    if (!document) {
      const markdown = await Bun.file(path).text()
      document = parseHTML(Bun.markdown.html(markdown)).document
      // GitHub-style heading fragments preserve repeated spaces around punctuation.
      const usedIds = new Set<string>()
      for (const heading of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        const base = (heading.textContent ?? '')
          .toLowerCase()
          .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\-\s]/gu, '')
          .replace(/ /g, '-')
        let id = base
        let suffix = 0
        while (usedIds.has(id)) id = `${base}-${++suffix}`
        usedIds.add(id)
        heading.id = id
      }
      documents.set(path, document)
    }
    return document
  }

  // Check each segment explicitly: macOS can otherwise hide case-only broken links.
  function existsWithExactCase(path: string): boolean {
    if (!existsSync(path)) return false
    const parent = dirname(path)
    if (parent === path) return true
    const name = relative(parent, path)
    return readdirSync(parent).includes(name) && existsWithExactCase(parent)
  }

  for (const file of files.filter(file => file.endsWith('.md'))) {
    const path = resolve(root, file)
    const document = await documentAt(path)
    for (const element of document.querySelectorAll('a[href], img[src]')) {
      const target = element.getAttribute('href') ?? element.getAttribute('src') ?? ''
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue
      const [address, fragment] = target.split('#', 2)
      let destination: string
      let anchor: string | undefined
      try {
        const pathname = decodeURIComponent(address.split('?', 1)[0])
        destination = pathname
          ? resolve(pathname.startsWith('/') ? root : dirname(path), pathname.replace(/^\//, ''))
          : path
        anchor = fragment ? decodeURIComponent(fragment) : undefined
      } catch {
        errors.push(`${file}: invalid link ${target}`)
        continue
      }
      if (
        (destination !== root && !destination.startsWith(root + sep)) ||
        !existsWithExactCase(destination)
      ) {
        errors.push(`${file}: missing local target ${target}`)
        continue
      }
      // Directory links and source-file line anchors do not use Markdown heading IDs.
      if (anchor && destination.endsWith('.md') && statSync(destination).isFile()) {
        const linkedDocument = await documentAt(destination)
        const found = [...linkedDocument.querySelectorAll('[id], a[name]')].some(
          node => node.id === anchor || node.getAttribute('name') === anchor
        )
        if (!found) errors.push(`${file}: missing heading ${target}`)
      }
    }
  }

  return errors
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..')
  const git = Bun.spawnSync(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root
    }
  )
  if (git.exitCode !== 0) throw new Error(git.stderr.toString())
  const files = [...new Set(git.stdout.toString().split('\0'))]
    .filter(file => file && existsSync(resolve(root, file)))
    .map(file =>
      relative(root, realpathSync(resolve(root, file)))
        .split(sep)
        .join('/')
    )
  const errors = await checkFiles(root, [...new Set(files)])
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log(`Checked naming and local Markdown links in ${files.length} repository files.`)
}
