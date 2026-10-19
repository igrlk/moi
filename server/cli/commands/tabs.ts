import { defineCommand } from 'citty'
import { resolve } from 'path'
import { dirArg } from '../args'
import { sendControl } from '../control'
import pc from '../pc'
import { columns } from '../ui'

// The listing behind `moi tabs`: every tab (static + views), one per row, the
// saved default (`layout.tabs.active`) marked. The
// addresses are documented in docs/navigation.md.
function runTabsList(dir: string) {
  const path = resolve(dir)
  sendControl(path, { type: 'tabs', path }, res => {
    type Row = { title: string; isDefault: boolean; href: string }
    const rows: Row[] = Array.isArray(res.tabs) ? (res.tabs as Row[]) : []
    console.log(
      '\n' + pc.bold('moi tabs') + pc.dim(' — workspace tabs, the default one marked') + '\n'
    )
    console.log(
      columns(
        ['', 'title', 'address'].map(h => pc.dim(h)),
        rows.map(row => [
          row.isDefault ? pc.green('●') : ' ',
          row.isDefault ? pc.bold(row.title) : row.title,
          row.href
        ])
      )
    )
    console.log('\n' + pc.dim('  Open one: moi navigate <address>') + '\n')
  })
}

export const tabs = defineCommand({
  meta: { name: 'tabs', description: 'List workspace tabs and their navigation addresses' },
  args: { dir: dirArg },
  run({ args }) {
    if (args._.length) {
      console.error('moi tabs only lists tabs. Use moi navigate <address> to navigate.')
      process.exit(1)
    }
    runTabsList(args.dir)
  }
})
