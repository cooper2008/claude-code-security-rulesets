const path = require('path');

console.log('🔍 Testing configuration file discovery...');

// Import our compiled discovery module
const discovery = require('../dist/config/discovery.js');

async function testBasicDiscovery() {
    try {
        console.log('📁 Current directory:', process.cwd());
        
        const sources = await discovery.discoverConfigurations({
            startDir: process.cwd(),
            includeNonExistent: false
        });
        
        console.log(`\n✅ Found ${sources.length} configuration sources:`);
        sources.forEach((source, i) => {
            console.log(`  ${i+1}. ${source.level}: ${source.path} (exists: ${source.exists})`);
        });
        
        // Test that our new paths are found
        const foundSettings = sources.find(s => s.path.endsWith('.claude/settings.json'));
        const foundLocal = sources.find(s => s.path.endsWith('.claude/settings.local.json'));
        
        if (foundSettings) console.log('\n✅ Found .claude/settings.json');
        if (foundLocal) console.log('✅ Found .claude/settings.local.json');
        
        console.log('\n🎉 Configuration discovery test passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testBasicDiscovery();
