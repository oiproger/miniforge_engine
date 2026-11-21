import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = process.cwd()
const pagesDir = resolve(root, 'dist/pages')
const editorDist = resolve(root, 'dist/editor')
const siteSrc = resolve(root, 'site')

console.log('1/3 Building web editor (pnpm build)...')
execSync('pnpm build', { stdio: 'inherit', cwd: root })

console.log('2/3 Assembling dist/pages (landing + docs + /editor/)...')
rmSync(pagesDir, { recursive: true, force: true })
mkdirSync(pagesDir, { recursive: true })

if (existsSync(siteSrc)) {
  cpSync(siteSrc, pagesDir, { recursive: true })
}
cpSync(editorDist, resolve(pagesDir, 'editor'), { recursive: true })

// Prevent GitHub Pages Jekyll from ignoring files/folders starting with underscore
writeFileSync(resolve(pagesDir, '.nojekyll'), '')

console.log('3/3 Done! Ready to serve or deploy from: dist/pages')
console.log('    - Landing: dist/pages/index.html')
console.log('    - Docs:    dist/pages/docs/index.html')
console.log('    - Editor:  dist/pages/editor/index.html')
