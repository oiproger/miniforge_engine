// Extract the public script surface from the runtime types when preparing the editor.
// This file runs in Node; the game never loads the TypeScript checker.
import ts from 'typescript'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

export async function writeScriptAPI(root, out) {
  const typePath = path.join(root, 'packages/runtime/src/types.ts')
  const config = ts.readConfigFile(path.join(root,'tsconfig.json'), ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  const program = ts.createProgram([typePath], options)
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(typePath)
  const definition = source.statements.find(n => ts.isInterfaceDeclaration(n) && n.name.text === 'GameAPI')
  const lifecycle = program.getSourceFile(path.join(root,'packages/runtime/src/lifecycle.ts')).statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='ScriptLifecycle')
  function members(type) {
    return checker.getPropertiesOfType(type).filter(symbol => {
      const decl = symbol.valueDeclaration || symbol.declarations?.[0]
      return decl && !(ts.getCombinedModifierFlags(decl) & (ts.ModifierFlags.Private|ts.ModifierFlags.Protected)) && !symbol.name.startsWith('__')
    })
  }
  function describe(type) {
    return members(type).map(symbol => {
      const member=checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol,definition))
      return {name:symbol.name, signature:checker.typeToString(member,definition,ts.TypeFormatFlags.NoTruncation),
        method:member.getCallSignatures().length>0, description:ts.displayPartsToString(symbol.getDocumentationComment(checker))}
    })
  }
  const base = checker.getTypeAtLocation(definition)
  const catalog={api:describe(base), lifecycle:describe(checker.getTypeAtLocation(lifecycle))}
  for(const symbol of members(base)){
    const type=checker.getTypeOfSymbolAtLocation(symbol,definition)
    if((type.flags&ts.TypeFlags.Object) && !type.getCallSignatures().length)catalog['api.'+symbol.name]=describe(type)
  }
  await writeFile(path.join(out,'script-api.json'), JSON.stringify(catalog))
}
