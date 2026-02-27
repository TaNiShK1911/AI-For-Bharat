/**
 * Diagnostic script to identify the specific issue with documentation indexing
 */

const path = require('path');
const fs = require('fs').promises;

async function diagnoseIssue() {
  console.log('🔍 Diagnosing AI Docs Interpreter issues...\n');
  
  const projectRoot = __dirname;
  
  // Check 1: Project structure
  console.log('📁 Checking project structure...');
  
  const requiredFiles = [
    'README.md',
    'src/extension.ts',
    'src/indexer/DocumentationIndexer.ts',
    'src/storage/SimpleVectorStore.ts',
    'src/rag/RAGEngine.ts',
    'package.json'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(projectRoot, file);
    try {
      await fs.access(filePath);
      console.log(`  ✅ ${file} exists`);
    } catch {
      console.log(`  ❌ ${file} missing`);
    }
  }
  
  // Check 2: Documentation files
  console.log('\n📚 Checking documentation files...');
  
  const readmePath = path.join(projectRoot, 'README.md');
  try {
    const readmeContent = await fs.readFile(readmePath, 'utf-8');
    console.log(`  ✅ README.md exists (${readmeContent.length} characters)`);
    
    // Count headers
    const headers = readmeContent.match(/^#{1,6}\s+.+$/gm) || [];
    console.log(`  📝 Found ${headers.length} headers in README.md`);
  } catch {
    console.log('  ❌ README.md not readable');
  }
  
  const docsDir = path.join(projectRoot, 'docs');
  try {
    const docsFiles = await fs.readdir(docsDir);
    const mdFiles = docsFiles.filter(f => f.endsWith('.md'));
    console.log(`  ✅ docs/ directory exists with ${mdFiles.length} markdown files`);
    mdFiles.forEach(file => console.log(`    - ${file}`));
  } catch {
    console.log('  ⚠️  docs/ directory not found or empty');
  }
  
  // Check 3: Build status
  console.log('\n🔨 Checking build status...');
  
  const outDir = path.join(projectRoot, 'out');
  try {
    const outFiles = await fs.readdir(outDir);
    console.log(`  ✅ out/ directory exists with ${outFiles.length} files`);
    
    const requiredOutFiles = [
      'extension.js',
      'indexer/DocumentationIndexer.js',
      'storage/SimpleVectorStore.js',
      'rag/RAGEngine.js'
    ];
    
    for (const file of requiredOutFiles) {
      const filePath = path.join(outDir, file);
      try {
        await fs.access(filePath);
        console.log(`    ✅ ${file} compiled`);
      } catch {
        console.log(`    ❌ ${file} missing`);
      }
    }
  } catch {
    console.log('  ❌ out/ directory not found - run npm run compile');
  }
  
  // Check 4: Package.json configuration
  console.log('\n📦 Checking package.json configuration...');
  
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'));
    
    console.log(`  ✅ Extension name: ${packageJson.name}`);
    console.log(`  ✅ Main entry: ${packageJson.main}`);
    
    const commands = packageJson.contributes?.commands || [];
    console.log(`  📋 Commands defined: ${commands.length}`);
    commands.forEach(cmd => console.log(`    - ${cmd.command}: ${cmd.title}`));
    
    const activationEvents = packageJson.activationEvents || [];
    console.log(`  🚀 Activation events: ${activationEvents.length}`);
    activationEvents.forEach(event => console.log(`    - ${event}`));
    
  } catch (error) {
    console.log('  ❌ Failed to read package.json:', error.message);
  }
  
  // Check 5: Dependencies
  console.log('\n📚 Checking dependencies...');
  
  const nodeModulesDir = path.join(projectRoot, 'node_modules');
  try {
    await fs.access(nodeModulesDir);
    console.log('  ✅ node_modules exists');
    
    const criticalDeps = ['glob', 'gray-matter', 'sqlite3'];
    for (const dep of criticalDeps) {
      try {
        await fs.access(path.join(nodeModulesDir, dep));
        console.log(`    ✅ ${dep} installed`);
      } catch {
        console.log(`    ❌ ${dep} missing`);
      }
    }
  } catch {
    console.log('  ❌ node_modules not found - run npm install');
  }
  
  // Check 6: Storage directory
  console.log('\n💾 Checking storage...');
  
  const aidocsDir = path.join(projectRoot, '.aidocs');
  try {
    const aidocsFiles = await fs.readdir(aidocsDir);
    console.log(`  ✅ .aidocs directory exists with ${aidocsFiles.length} files`);
    if (aidocsFiles.length === 0) {
      console.log('    ⚠️  Directory is empty - indexing may not have run yet');
    } else {
      aidocsFiles.forEach(file => console.log(`    - ${file}`));
    }
  } catch {
    console.log('  ⚠️  .aidocs directory not found - will be created on first indexing');
  }
  
  // Check 7: Potential issues analysis
  console.log('\n🔍 Analyzing potential issues...');
  
  // Check if the extension is using the correct main entry point
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'));
    const mainEntry = packageJson.main;
    
    if (mainEntry === './dist/extension.js') {
      try {
        await fs.access(path.join(projectRoot, 'dist/extension.js'));
        console.log('  ✅ Main entry point exists (dist/extension.js)');
      } catch {
        console.log('  ❌ Main entry point missing - run npm run package');
      }
    } else if (mainEntry === './out/extension.js') {
      try {
        await fs.access(path.join(projectRoot, 'out/extension.js'));
        console.log('  ✅ Main entry point exists (out/extension.js)');
      } catch {
        console.log('  ❌ Main entry point missing - run npm run compile');
      }
    }
  } catch {}
  
  // Summary and recommendations
  console.log('\n📋 Summary and Recommendations:');
  console.log('');
  console.log('If indexing is not working, try these steps:');
  console.log('1. Ensure you have documentation files (README.md or docs/*.md)');
  console.log('2. Run "npm run compile" to build the extension');
  console.log('3. Press F5 to launch the extension in a new VS Code window');
  console.log('4. Open a JavaScript/TypeScript project');
  console.log('5. Run "AI Docs: Index Documentation" from the command palette');
  console.log('6. Check the VS Code output panel for any error messages');
  console.log('');
  console.log('Common issues:');
  console.log('- Extension not activated (check activation events)');
  console.log('- No documentation files found');
  console.log('- VS Code storage permissions');
  console.log('- Missing dependencies');
  
  console.log('\n✅ Diagnosis complete!');
}

// Run the diagnosis
diagnoseIssue().catch(console.error);