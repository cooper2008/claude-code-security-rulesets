#!/usr/bin/env node

// Simple test to verify the configuration preview functionality
const { SecurityWizard } = require('./dist/setup/wizard');

async function testConfigPreview() {
  try {
    console.log('Testing configuration preview...');
    
    const wizard = new SecurityWizard();
    
    // Create a mock scan result with some test data
    const mockScanResult = {
      projectType: 'web-development',
      files: [
        {
          fullPath: '/test/.env',
          relativePath: '.env',
          type: 'Environment Variables',
          risk: 'CRITICAL',
          scope: 'project',
          explanation: 'Contains API keys and secrets',
          suggestedRule: 'Read(.env*)'
        },
        {
          fullPath: '/test/config/database.yml',
          relativePath: 'config/database.yml',
          type: 'Database Configuration',
          risk: 'HIGH',
          scope: 'project',
          explanation: 'Database connection strings',
          suggestedRule: 'Read(**/config/database*)'
        },
        {
          fullPath: '/Users/test/.ssh/id_rsa',
          relativePath: '~/.ssh/id_rsa',
          type: 'SSH Private Keys',
          risk: 'CRITICAL',
          scope: 'personal',
          explanation: 'Private SSH keys for server access',
          suggestedRule: 'Read(**/id_rsa*)'
        }
      ],
      projectFiles: [
        {
          fullPath: '/test/.env',
          relativePath: '.env',
          type: 'Environment Variables',
          risk: 'CRITICAL',
          scope: 'project',
          explanation: 'Contains API keys and secrets',
          suggestedRule: 'Read(.env*)'
        }
      ],
      personalFiles: [
        {
          fullPath: '/Users/test/.ssh/id_rsa',
          relativePath: '~/.ssh/id_rsa',
          type: 'SSH Private Keys',
          risk: 'CRITICAL',
          scope: 'personal',
          explanation: 'Private SSH keys for server access',
          suggestedRule: 'Read(**/id_rsa*)'
        }
      ],
      summary: {
        totalFiles: 3,
        criticalFiles: 2,
        highFiles: 1,
        mediumFiles: 0,
        lowFiles: 0,
        projectFiles: 1,
        personalFiles: 1
      }
    };
    
    // Test the simulateApplication method that should call showConfigurationPreview
    console.log('Calling simulateApplication...');
    const result = wizard.simulateApplication(mockScanResult);
    console.log('\nTest completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testConfigPreview();