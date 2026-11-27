import { readFile, writeFile, readdir } from 'node:fs/promises'
import { marked } from 'marked'
import { GRAPH_NODE_CATALOG, getNodePins, makeDefaultEventGraph, type GraphPinDef } from '../packages/project-schema/src/eventGraph'
import { behaviorDefaults, eventNames } from '../packages/behaviors/src/catalog'
import { scriptCatalog } from '../packages/exporter/script-api.mjs'

const esc = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const code = (v: string) => '<code>' + esc(v) + '</code>'
const sections: { title: string; body: string }[] = []
const add = (title: string, body: string) => sections.push({title, body})
const guide = await readFile('site/docs/index.html', 'utf8')
const russian = guide.slice(guide.indexOf('<div id="docsRu"'), guide.indexOf('</main>'))
add('Как пользоваться справочником', '<p>Для первого проекта начните с практикума по HUD или урока Key Vault. Разделы api.* содержат сигнатуры методов для скриптов. В разделах type приведены связанные типы, включая Tween. Каталог Event Graph показывает входы, выходы и значения по умолчанию. Для поиска по любой ноде или методу нажмите Ctrl+F.</p><p>Базовое руководство редактора описывает серию 3.0. Подробности текущего поведения сети, теней, декалей и GI приведены в тематических главах. Steam Relay Lab запускается в Local Debug или с нативным Steamworks через Play with Steam в Desktop-редакторе. Для проверки Steam Overlay и запуска через Steam используйте депо.</p>')
add('Редактор и рабочие процессы', [...russian.matchAll(/<section\b[\s\S]*?<\/section>/g)].map(m => m[0]).join('\n'))
add('Практикум по HUD и Quick tips', await marked.parse(await readFile('docs/ui-cookbook.md', 'utf8')))
const catalog = scriptCatalog(process.cwd(), true)
for (const [group, members] of Object.entries(catalog)) {
  add(group, '<dl>' + members.map(m => '<dt>' + code(group + '.' + m.name) + '</dt><dd>' + code(m.signature) + '<p>' + esc(m.description) + '</p></dd>').join('\n') + '</dl>')
}
function pins(items: GraphPinDef[]) {
  return items.map(p => code(p.id + ' · ' + p.type) + (p.defaultValue === undefined ? '' : ' = ' + code(JSON.stringify(p.defaultValue))) +
    (p.options ? ' (' + esc(p.options.join(', ')) + ')' : '')).join('<br>') || '—'
}
const graph = makeDefaultEventGraph()
for (const category of new Set(GRAPH_NODE_CATALOG.map(n => n.category))) {
  const rows = GRAPH_NODE_CATALOG.filter(n => n.category === category).map(n => {
    const spec = getNodePins({id:'sample', type:n.type, x:0, y:0}, graph)
    return '<tr><th>' + esc(n.title) + '<br>' + code(n.type) + '</th><td>' + pins(spec.inputs) + '</td><td>' + pins(spec.outputs) + '</td></tr>'
  })
  add('Event Graph · ' + category, '<p>Для пользовательских функций и переменных типы и порты определяет граф проекта. Switch может иметь дополнительные ветки.</p><table><tr><th>Нода</th><th>Входы и значения по умолчанию</th><th>Выходы</th></tr>' + rows.join('\n') + '</table>')
}
add('Поведения и события', '<dl>' + Object.entries(behaviorDefaults).map(([id,[name,params]]) => '<dt>' + esc(name) + ' · ' + code(id) + '</dt><dd>' + code(JSON.stringify(params)) + '</dd>').join('\n') + '</dl><p>' + eventNames.map(code).join(', ') + '</p>')
const chapterIds = new Map<number, string>()
const chapterLinks = new Map<string, string>()
const networkChapters: Record<string, string> = {
  'NETWORKING.md': 'networking',
  'STEAM_NATIVE.md': 'steamworks',
}
const docs = (await readdir('docs')).filter(file =>
  file.endsWith('.md') && file !== 'ui-cookbook.md' && file !== 'NETWORKING.md').sort()
docs.push('NETWORKING.md')
for (const f of docs) {
  const source = await readFile('docs/' + f, 'utf8')
  const stableId = networkChapters[f]
  const chapter = stableId ?? 'chapter-' + sections.length
  if (stableId) chapterIds.set(sections.length, chapter)
  chapterLinks.set(f, chapter)
  if (stableId) chapterLinks.set('handbook.html#' + stableId, chapter)
  add(source.split('\n')[0].replace(/^#\s*/, ''), await marked.parse(source))
}
for (const section of sections) {
  for (const [href, chapter] of chapterLinks) {
    section.body = section.body.replaceAll(`href="${href}"`, `href="#${chapter}"`)
  }
}
const idForChapter = (index: number) => chapterIds.get(index) ?? 'chapter-' + index
const toc = sections.map((s,i) => '<li><a href="#' + idForChapter(i) + '">' + esc(s.title) + '</a></li>').join('\n')
const html = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Miniforge Engine · Руководство разработчика</title><style>body{max-width:76rem;margin:auto;padding:2rem;font:16px/1.55 system-ui;color:#24262a}nav ul{columns:2}section{margin-block:3rem}th,td{padding:.45rem;text-align:left;vertical-align:top;border-bottom:1px solid #ddd}table{border-collapse:collapse}code{overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#f3f4f5;padding:1rem}dt{font-weight:bold}dd{margin:.2rem 0 1rem}a{color:#205994}@media print{nav{break-after:page}h2,h3{break-after:avoid}}</style><main><h1>Miniforge Engine · Руководство разработчика</h1><nav><ul>' + toc + '</ul></nav>' + sections.map((s,i) => '<section id="chapter-' + i + '"><h2' +
  (chapterIds.has(i) ? ' id="' + chapterIds.get(i) + '"' : '') + '>' + esc(s.title) + '</h2>' + s.body + '</section>').join('\n') + '</main></html>'
await writeFile('site/docs/handbook.html', html)
console.log(Object.keys(catalog).length, 'API sections;', GRAPH_NODE_CATALOG.length, 'nodes;', sections.length, 'chapters')
