import { defineCommand } from 'citty'
import { versionWithCommit } from '../../version'

export const version = defineCommand({
  meta: { name: 'version', description: 'Print the Moi version' },
  run() {
    console.log(versionWithCommit())
  }
})
