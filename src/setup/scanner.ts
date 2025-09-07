/**
 * Educational Scanner - Project Type Detection and Risk Analysis
 * Scans files with educational context and explanations
 */

import { promises as fs } from 'fs';
import { join, relative, basename } from 'path';
import { homedir } from 'os';
import { formatDuration, formatFileCount } from '../utils/formatters';

export type ProjectType = 'web-development' | 'python' | 'devops' | 'infrastructure' | 'mobile' | 'data-science' | 'java' | 'dotnet' | 'ruby' | 'php' | 'rust' | 'swift' | 'go' | 'general';
export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type FileScope = 'project' | 'personal' | 'system';

export interface ScanFile {
  /** Full file path */
  fullPath: string;
  /** Path relative to scan root */
  relativePath: string;
  /** File type category */
  type: string;
  /** Risk level */
  risk: RiskLevel;
  /** File scope (project/personal/system) */
  scope: FileScope;
  /** Human-readable explanation */
  explanation: string;
  /** Suggested Claude Code rule */
  suggestedRule: string;
}

export interface ScanResult {
  /** Detected project type */
  projectType: ProjectType;
  /** All found files */
  files: ScanFile[];
  /** Project-specific files */
  projectFiles: ScanFile[];
  /** Personal/home directory files */
  personalFiles: ScanFile[];
  /** Summary statistics */
  summary: {
    totalFiles: number;
    criticalFiles: number;
    highFiles: number;
    mediumFiles: number;
    lowFiles: number;
    projectFiles: number;
    personalFiles: number;
  };
}

/**
 * Pattern definitions with educational context
 */
interface ScanPattern {
  /** Regex pattern to match files */
  pattern: RegExp;
  /** File type description */
  type: string;
  /** Risk level */
  risk: RiskLevel;
  /** User-friendly explanation */
  explanation: string;
  /** Suggested Claude Code deny rule */
  rule: string;
  /** Which project types this is relevant for */
  relevantFor?: ProjectType[];
}

/**
 * Educational Scanner Class
 */
export class Scanner {
  
  /**
   * Project-specific sensitive patterns with educational context
   */
  private projectPatterns: ScanPattern[] = [
    // Environment and Secrets - CRITICAL
    {
      pattern: /^\.env(\.|$|\.local$|\.prod$|\.dev$)/,
      type: 'Environment Variables',
      risk: 'CRITICAL',
      explanation: 'Contains API keys, database passwords, and secrets',
      rule: 'Read(.env*)'
    },
    {
      pattern: /^\.?secrets?($|\/)/,
      type: 'Secrets Directory', 
      risk: 'CRITICAL',
      explanation: 'Directory containing sensitive configuration files',
      rule: 'Read(**/secrets/**)'
    },
    
    // Database and Config Files - HIGH
    {
      pattern: /config\/(database|credentials|keys)\.ya?ml$/,
      type: 'Database Configuration',
      risk: 'HIGH', 
      explanation: 'Database connection strings and credentials',
      rule: 'Read(**/config/database*)',
      relevantFor: ['web-development', 'python']
    },
    {
      pattern: /appsettings\.(json|xml)$/,
      type: '.NET Configuration',
      risk: 'HIGH',
      explanation: 'Application settings with potential secrets',
      rule: 'Read(**/appsettings*)'
    },
    
    // Infrastructure as Code - HIGH
    {
      pattern: /terraform\.tfstate$/,
      type: 'Terraform State',
      risk: 'CRITICAL',
      explanation: 'Infrastructure state with cloud credentials and resources',
      rule: 'Read(**/*.tfstate)',
      relevantFor: ['devops', 'infrastructure']
    },
    {
      pattern: /\.terraform\//,
      type: 'Terraform Directory',
      risk: 'MEDIUM',
      explanation: 'Terraform working directory with potential secrets',
      rule: 'Read(**/.terraform/**)',
      relevantFor: ['devops', 'infrastructure']
    },
    
    // Container and Orchestration - MEDIUM to HIGH
    {
      pattern: /docker-compose\.ya?ml$/,
      type: 'Docker Compose',
      risk: 'MEDIUM',
      explanation: 'Container configuration that may include environment variables',
      rule: 'Read(**/docker-compose*)',
      relevantFor: ['devops', 'web-development']
    },
    {
      pattern: /Dockerfile(\.|$)/,
      type: 'Dockerfile',
      risk: 'LOW',
      explanation: 'Container build instructions (usually safe but may contain secrets)',
      rule: 'Ask(**/*Dockerfile*)',
      relevantFor: ['devops', 'web-development']
    },
    
    // Database Files - MEDIUM
    {
      pattern: /\.(db|sqlite|sqlite3)$/,
      type: 'Database File',
      risk: 'MEDIUM',
      explanation: 'Local database file with potential user data',
      rule: 'Read(**/*.db)'
    },
    {
      pattern: /(dump|backup)\.sql$/,
      type: 'Database Backup',
      risk: 'HIGH',
      explanation: 'Database dump file with complete data export',
      rule: 'Read(**/*dump*.sql)'
    },
    
    // Certificates and Keys - CRITICAL
    {
      pattern: /\.(pem|key|p12|pfx)$/,
      type: 'Certificate/Key Files',
      risk: 'CRITICAL',
      explanation: 'SSL certificates or private keys for encryption',
      rule: 'Read(**/*.key)'
    },
    
    // Language-Specific Security Patterns
    
    // Java/JVM - HIGH to CRITICAL
    {
      pattern: /application\.(properties|yml|yaml)$/,
      type: 'Java Application Config',
      risk: 'HIGH',
      explanation: 'Spring Boot and Java application properties with potential secrets',
      rule: 'Read(**/application.{properties,yml,yaml})',
      relevantFor: ['java']
    },
    {
      pattern: /\.(keystore|jks|p12|pfx)$/,
      type: 'Java KeyStore',
      risk: 'CRITICAL',
      explanation: 'Java keystore files containing certificates and private keys',
      rule: 'Read(**/*.{keystore,jks,p12,pfx})',
      relevantFor: ['java']
    },
    {
      pattern: /gradle\.properties$/,
      type: 'Gradle Properties',
      risk: 'HIGH',
      explanation: 'Gradle build properties that may contain signing keys and credentials',
      rule: 'Read(**/gradle.properties)',
      relevantFor: ['java']
    },
    {
      pattern: /local\.properties$/,
      type: 'Android Local Properties',
      risk: 'MEDIUM',
      explanation: 'Android SDK paths and local development settings',
      rule: 'Ask(**/local.properties)',
      relevantFor: ['mobile', 'java']
    },

    // Python - MEDIUM to HIGH
    {
      pattern: /\.python-version$/,
      type: 'Python Version File',
      risk: 'LOW',
      explanation: 'Python version specification (usually safe)',
      rule: 'Ask(**/.python-version)',
      relevantFor: ['python']
    },
    {
      pattern: /\.(pypirc|pip\.conf)$/,
      type: 'Python Package Config',
      risk: 'HIGH',
      explanation: 'Python package index credentials and configuration',
      rule: 'Read(**/.{pypirc,pip.conf})',
      relevantFor: ['python']
    },
    {
      pattern: /django.*settings.*\.py$/,
      type: 'Django Settings',
      risk: 'HIGH',
      explanation: 'Django application settings with database and secret keys',
      rule: 'Read(**/django*settings*.py)',
      relevantFor: ['python']
    },
    {
      pattern: /(celerybeat-schedule|celerybeat\.pid)$/,
      type: 'Celery Runtime Files',
      risk: 'LOW',
      explanation: 'Celery task scheduler runtime files',
      rule: 'Ask(**/*celerybeat*)',
      relevantFor: ['python']
    },

    // Go - MEDIUM to HIGH
    {
      pattern: /go\.(mod|sum)$/,
      type: 'Go Modules',
      risk: 'LOW',
      explanation: 'Go module definitions (usually safe)',
      rule: 'Ask(**/go.{mod,sum})',
      relevantFor: ['go']
    },
    {
      pattern: /vendor\//,
      type: 'Go Vendor Directory',
      risk: 'LOW',
      explanation: 'Go vendored dependencies (usually safe but large)',
      rule: 'Read(**/vendor/**)',
      relevantFor: ['go']
    },

    // .NET/C# - HIGH
    {
      pattern: /Web\.(config|Config)$/,
      type: '.NET Web Config',
      risk: 'HIGH',
      explanation: 'ASP.NET configuration with connection strings and secrets',
      rule: 'Read(**/Web.{config,Config})',
      relevantFor: ['dotnet']
    },
    {
      pattern: /app\.(config|Config)$/,
      type: '.NET App Config',
      risk: 'HIGH',
      explanation: '.NET application configuration files',
      rule: 'Read(**/app.{config,Config})',
      relevantFor: ['dotnet']
    },
    {
      pattern: /connectionStrings\.(config|json)$/,
      type: '.NET Connection Strings',
      risk: 'CRITICAL',
      explanation: 'Database connection strings with credentials',
      rule: 'Read(**/connectionStrings.{config,json})',
      relevantFor: ['dotnet']
    },

    // Ruby - MEDIUM to HIGH
    {
      pattern: /Gemfile(\.lock)?$/,
      type: 'Ruby Dependencies',
      risk: 'LOW',
      explanation: 'Ruby gem dependencies (usually safe)',
      rule: 'Ask(**/Gemfile*)',
      relevantFor: ['ruby']
    },
    {
      pattern: /(config\/)?database\.yml$/,
      type: 'Rails Database Config',
      risk: 'CRITICAL',
      explanation: 'Rails database configuration with credentials',
      rule: 'Read(**/*database.yml)',
      relevantFor: ['ruby']
    },
    {
      pattern: /(config\/)?secrets\.yml$/,
      type: 'Rails Secrets',
      risk: 'CRITICAL',
      explanation: 'Rails application secrets and API keys',
      rule: 'Read(**/*secrets.yml)',
      relevantFor: ['ruby']
    },

    // PHP - HIGH to CRITICAL
    {
      pattern: /composer\.(json|lock)$/,
      type: 'PHP Composer',
      risk: 'LOW',
      explanation: 'PHP package manager files (usually safe)',
      rule: 'Ask(**/composer.{json,lock})',
      relevantFor: ['php']
    },
    {
      pattern: /wp-config\.php$/,
      type: 'WordPress Config',
      risk: 'CRITICAL',
      explanation: 'WordPress configuration with database credentials and keys',
      rule: 'Read(**/wp-config.php)',
      relevantFor: ['php']
    },
    {
      pattern: /\.htaccess$/,
      type: 'Apache .htaccess',
      risk: 'MEDIUM',
      explanation: 'Apache configuration that may contain sensitive directives',
      rule: 'Ask(**/.htaccess)',
      relevantFor: ['php']
    },

    // Rust - LOW to MEDIUM
    {
      pattern: /Cargo\.(toml|lock)$/,
      type: 'Rust Cargo',
      risk: 'LOW',
      explanation: 'Rust package manager files (usually safe)',
      rule: 'Ask(**/Cargo.{toml,lock})',
      relevantFor: ['rust']
    },
    {
      pattern: /target\//,
      type: 'Rust Build Directory',
      risk: 'LOW',
      explanation: 'Rust compilation output (usually safe but large)',
      rule: 'Read(**/target/**)',
      relevantFor: ['rust']
    },

    // Swift/iOS - HIGH to CRITICAL
    {
      pattern: /.*\.xcconfig$/,
      type: 'Xcode Configuration',
      risk: 'HIGH',
      explanation: 'Xcode build configuration that may contain signing credentials',
      rule: 'Read(**/*.xcconfig)',
      relevantFor: ['mobile', 'swift']
    },
    {
      pattern: /.*\.(mobileprovision|p12|cer)$/,
      type: 'iOS Certificates',
      risk: 'CRITICAL',
      explanation: 'iOS provisioning profiles and certificates for app signing',
      rule: 'Read(**/*.{mobileprovision,p12,cer})',
      relevantFor: ['mobile', 'swift']
    },
    {
      pattern: /GoogleService-Info\.plist$/,
      type: 'iOS Firebase Config',
      risk: 'HIGH',
      explanation: 'Firebase configuration for iOS with API keys',
      rule: 'Read(**/GoogleService-Info.plist)',
      relevantFor: ['mobile', 'swift']
    },

    // Android - HIGH to CRITICAL
    {
      pattern: /google-services\.json$/,
      type: 'Android Firebase Config',
      risk: 'HIGH',
      explanation: 'Firebase configuration for Android with API keys',
      rule: 'Read(**/google-services.json)',
      relevantFor: ['mobile', 'java']
    },
    {
      pattern: /.*\.jks$/,
      type: 'Android Keystore',
      risk: 'CRITICAL',
      explanation: 'Android app signing keystore',
      rule: 'Read(**/*.jks)',
      relevantFor: ['mobile', 'java']
    },
    {
      pattern: /keystore\.properties$/,
      type: 'Android Keystore Properties',
      risk: 'CRITICAL',
      explanation: 'Android keystore credentials for app signing',
      rule: 'Read(**/keystore.properties)',
      relevantFor: ['mobile', 'java']
    },

    // Universal Binary Files - CRITICAL to HIGH
    {
      pattern: /\.(so|dll|dylib)$/,
      type: 'Native Shared Libraries',
      risk: 'CRITICAL',
      explanation: 'Shared libraries that AI tools cannot analyze - potential security blind spots',
      rule: 'Ask(**/*.{so,dll,dylib})'
    },
    {
      pattern: /\.(a|lib|o|obj)$/,
      type: 'Compiled Object Files',
      risk: 'HIGH',
      explanation: 'Static libraries and object files unanalyzable by AI tools',
      rule: 'Ask(**/*.{a,lib,o,obj})'
    },
    {
      pattern: /\.(wasm|wat)$/,
      type: 'WebAssembly Modules',
      risk: 'HIGH',
      explanation: 'WebAssembly binaries compiled from C/C++/Rust - security analysis limited',
      rule: 'Ask(**/*.{wasm,wat})'
    },
    {
      pattern: /\.(exe|bin|elf)$/,
      type: 'Executable Binaries',
      risk: 'CRITICAL',
      explanation: 'Compiled executable files that cannot be source-analyzed by AI',
      rule: 'Ask(**/*.{exe,bin,elf})'
    },

    // Java/JVM Binary Artifacts - HIGH
    {
      pattern: /\.(jar|war|ear)$/,
      type: 'Java Archives',
      risk: 'HIGH',
      explanation: 'Java bytecode archives - AI analysis limited to bytecode, not source',
      rule: 'Ask(**/*.{jar,war,ear})',
      relevantFor: ['java']
    },
    {
      pattern: /\.class$/,
      type: 'Java Bytecode',
      risk: 'MEDIUM',
      explanation: 'Compiled Java classes - analysis differs from source code',
      rule: 'Ask(**/*.class)',
      relevantFor: ['java']
    },
    {
      pattern: /(lib\/.*\.(so|dll|dylib)|native\/.*\.(so|dll|dylib))$/,
      type: 'JNI Native Libraries',
      risk: 'CRITICAL',
      explanation: 'Java Native Interface libraries - unanalyzable native code',
      rule: 'Ask(**/lib/**/*.{so,dll,dylib})',
      relevantFor: ['java']
    },

    // .NET Binary Artifacts - HIGH
    {
      pattern: /\.(dll|exe|pdb)$/,
      type: '.NET Assemblies',
      risk: 'HIGH',
      explanation: '.NET compiled assemblies and debug symbols - IL analysis vs source differences',
      rule: 'Ask(**/*.{dll,exe,pdb})',
      relevantFor: ['dotnet']
    },
    {
      pattern: /bin\/(Debug|Release)/,
      type: '.NET Build Output',
      risk: 'MEDIUM',
      explanation: '.NET compiled output directory with assemblies',
      rule: 'Ask(**/bin/**)',
      relevantFor: ['dotnet']
    },

    // Python Native Extensions - HIGH to CRITICAL
    {
      pattern: /\.(whl)$/,
      type: 'Python Wheel Files',
      risk: 'HIGH',
      explanation: 'Python binary distributions that may contain compiled C extensions',
      rule: 'Ask(**/*.whl)',
      relevantFor: ['python']
    },
    {
      pattern: /\.(pyd|so)$/,
      type: 'Python Native Extensions',
      risk: 'CRITICAL',
      explanation: 'Python C extensions - native code unanalyzable by AI tools',
      rule: 'Ask(**/*.{pyd,so})',
      relevantFor: ['python']
    },
    {
      pattern: /build\/(lib|temp|bdist)/,
      type: 'Python Build Artifacts',
      risk: 'MEDIUM',
      explanation: 'Python build directory with compiled extensions and temporary files',
      rule: 'Ask(**/build/**)',
      relevantFor: ['python']
    },
    {
      pattern: /.*\.egg-info\//,
      type: 'Python Package Metadata',
      risk: 'LOW',
      explanation: 'Python package installation metadata',
      rule: 'Ask(**/*.egg-info/**)',
      relevantFor: ['python']
    },

    // Node.js Native Modules - CRITICAL
    {
      pattern: /\.node$/,
      type: 'Node.js Native Modules',
      risk: 'CRITICAL',
      explanation: 'Compiled C/C++ addons for Node.js - unanalyzable native code',
      rule: 'Ask(**/*.node)',
      relevantFor: ['web-development']
    },
    {
      pattern: /build\/Release\/.*\.node$/,
      type: 'Node.js Compiled Addons',
      risk: 'CRITICAL',
      explanation: 'Built native Node.js modules in Release configuration',
      rule: 'Ask(**/build/Release/*.node)',
      relevantFor: ['web-development']
    },
    {
      pattern: /prebuilds\//,
      type: 'Node.js Prebuild Binaries',
      risk: 'HIGH',
      explanation: 'Precompiled native modules for different platforms',
      rule: 'Ask(**/prebuilds/**)',
      relevantFor: ['web-development']
    },

    // Rust Binary Artifacts - MEDIUM to HIGH  
    {
      pattern: /target\/(debug|release)\/.*$/,
      type: 'Rust Compiled Binaries',
      risk: 'MEDIUM',
      explanation: 'Rust compiled executables and libraries - not source analyzable',
      rule: 'Ask(**/target/**)',
      relevantFor: ['rust']
    },
    {
      pattern: /\.rlib$/,
      type: 'Rust Library Files',
      risk: 'HIGH',
      explanation: 'Rust compiled library crates',
      rule: 'Ask(**/*.rlib)',
      relevantFor: ['rust']
    },

    // Go Binary Dependencies - MEDIUM to HIGH
    {
      pattern: /.*-cgo$/,
      type: 'Go CGO Dependencies',
      risk: 'HIGH',
      explanation: 'Go packages with C dependencies - native code unanalyzable',
      rule: 'Ask(**/*-cgo)',
      relevantFor: ['go']
    },
    {
      pattern: /pkg\/.*\.(a|so)$/,
      type: 'Go Package Objects',
      risk: 'MEDIUM',
      explanation: 'Go compiled package objects and shared libraries',
      rule: 'Ask(**/pkg/**/*.{a,so})',
      relevantFor: ['go']
    },

    // Mobile Platform Binaries - CRITICAL
    {
      pattern: /\.(ipa|apk|aab)$/,
      type: 'Mobile App Packages',
      risk: 'HIGH',
      explanation: 'Compiled mobile applications - limited analysis capability',
      rule: 'Ask(**/*.{ipa,apk,aab})',
      relevantFor: ['mobile']
    },
    {
      pattern: /\.(framework|bundle|dylib)$/,
      type: 'iOS/macOS Frameworks',
      risk: 'HIGH',
      explanation: 'Apple platform frameworks with compiled code',
      rule: 'Ask(**/*.{framework,bundle,dylib})',
      relevantFor: ['swift', 'mobile']
    },
    {
      pattern: /\.(aar)$/,
      type: 'Android Archive Libraries',
      risk: 'HIGH',
      explanation: 'Android library archives with compiled code and resources',
      rule: 'Ask(**/*.aar)',
      relevantFor: ['java', 'mobile']
    },
    {
      pattern: /\.dex$/,
      type: 'Android DEX Bytecode',
      risk: 'MEDIUM',
      explanation: 'Dalvik Executable files - bytecode analysis vs source differences',
      rule: 'Ask(**/*.dex)',
      relevantFor: ['java', 'mobile']
    },

    // WebAssembly Ecosystem - HIGH
    {
      pattern: /\.(wasm|wat|wit)$/,
      type: 'WebAssembly Components',
      risk: 'HIGH',
      explanation: 'WebAssembly modules and interface definitions - compiled from various languages',
      rule: 'Ask(**/*.{wasm,wat,wit})'
    },

    // Generic Binary Archives - MEDIUM
    {
      pattern: /\.(tar\.gz|tgz|zip|7z|rar)$/,
      type: 'Compressed Archives',
      risk: 'MEDIUM',
      explanation: 'Archive files that may contain binary dependencies',
      rule: 'Ask(**/*.{tar.gz,tgz,zip,7z,rar})'
    },

    // Development Files - LOW to MEDIUM
    {
      pattern: /\.(log|logs)$/,
      type: 'Log Files',
      risk: 'LOW',
      explanation: 'Application logs that might contain sensitive data',
      rule: 'Ask(**/*.log)'
    },
    {
      pattern: /node_modules\//,
      type: 'Node Dependencies',
      risk: 'LOW',
      explanation: 'JavaScript dependencies (usually safe, but very large)',
      rule: 'Read(**/node_modules/**)',
      relevantFor: ['web-development']
    },
  ];

  /**
   * Personal/Home directory patterns with educational context
   */
  private personalPatterns: ScanPattern[] = [
    // SSH - CRITICAL
    {
      pattern: /\.ssh\//,
      type: 'SSH Directory',
      risk: 'CRITICAL',
      explanation: 'SSH configuration and keys for server access',
      rule: 'Read(**/.ssh/**)'
    },
    {
      pattern: /id_(rsa|ed25519|ecdsa)(\.|$)/,
      type: 'SSH Private Keys',
      risk: 'CRITICAL', 
      explanation: 'Private SSH keys for server and Git authentication',
      rule: 'Read(**/id_rsa*)'
    },
    
    // Cloud Providers - CRITICAL
    {
      pattern: /\.aws\/credentials$/,
      type: 'AWS Credentials',
      risk: 'CRITICAL',
      explanation: 'Amazon Web Services access keys and secrets',
      rule: 'Read(**/.aws/credentials)'
    },
    {
      pattern: /\.aws\/config$/,
      type: 'AWS Config',
      risk: 'HIGH',
      explanation: 'AWS CLI configuration with default regions and profiles',
      rule: 'Read(**/.aws/config)'
    },
    {
      pattern: /\.aws\//,
      type: 'AWS Configuration',
      risk: 'HIGH',
      explanation: 'AWS configuration files and session data',
      rule: 'Read(**/.aws/**)'
    },
    {
      pattern: /\.gcloud\//,
      type: 'Google Cloud Config',
      risk: 'HIGH',
      explanation: 'Google Cloud credentials and configuration',
      rule: 'Read(**/.gcloud/**)'
    },
    {
      pattern: /application_default_credentials\.json$/,
      type: 'GCP Credentials',
      risk: 'CRITICAL',
      explanation: 'Google Cloud default application credentials',
      rule: 'Read(**/*credentials*.json)'
    },
    {
      pattern: /\.azure\//,
      type: 'Azure Configuration',
      risk: 'HIGH',
      explanation: 'Microsoft Azure CLI credentials and configuration',
      rule: 'Read(**/.azure/**)'
    },
    {
      pattern: /\.config\/gcloud\//,
      type: 'Google Cloud SDK',
      risk: 'HIGH',
      explanation: 'Google Cloud SDK configuration and credentials',
      rule: 'Read(**/.config/gcloud/**)'
    },
    {
      pattern: /\.digitalocean\//,
      type: 'DigitalOcean Config',
      risk: 'HIGH',
      explanation: 'DigitalOcean API credentials and configuration',
      rule: 'Read(**/.digitalocean/**)'
    },
    {
      pattern: /\.linode-cli$/,
      type: 'Linode Configuration',
      risk: 'HIGH',
      explanation: 'Linode cloud service credentials',
      rule: 'Read(**/.linode-cli)'
    },
    {
      pattern: /\.vultr-cli$/,
      type: 'Vultr Configuration',
      risk: 'HIGH',
      explanation: 'Vultr cloud service API credentials',
      rule: 'Read(**/.vultr-cli)'
    },
    {
      pattern: /\.oci\//,
      type: 'Oracle Cloud Config',
      risk: 'HIGH',
      explanation: 'Oracle Cloud Infrastructure credentials',
      rule: 'Read(**/.oci/**)'
    },
    {
      pattern: /\.ibmcloud\//,
      type: 'IBM Cloud Config',
      risk: 'HIGH',
      explanation: 'IBM Cloud CLI credentials and configuration',
      rule: 'Read(**/.ibmcloud/**)'
    },
    {
      pattern: /\.heroku\//,
      type: 'Heroku Credentials',
      risk: 'HIGH',
      explanation: 'Heroku platform credentials and API keys',
      rule: 'Read(**/.heroku/**)'
    },
    {
      pattern: /\.netlify\//,
      type: 'Netlify Configuration',
      risk: 'HIGH',
      explanation: 'Netlify deployment credentials and site tokens',
      rule: 'Read(**/.netlify/**)'
    },
    {
      pattern: /\.vercel\//,
      type: 'Vercel Configuration',
      risk: 'HIGH',
      explanation: 'Vercel deployment tokens and project settings',
      rule: 'Read(**/.vercel/**)'
    },
    
    // Container and Orchestration - MEDIUM to HIGH
    {
      pattern: /\.docker\/config\.json$/,
      type: 'Docker Registry Auth',
      risk: 'HIGH',
      explanation: 'Docker registry authentication and credentials',
      rule: 'Read(**/.docker/config.json)'
    },
    {
      pattern: /\.docker\//,
      type: 'Docker Configuration',
      risk: 'MEDIUM',
      explanation: 'Docker client configuration and registry credentials',
      rule: 'Read(**/.docker/**)'
    },
    {
      pattern: /\.kube\/config$/,
      type: 'Kubernetes Config',
      risk: 'CRITICAL',
      explanation: 'Kubernetes cluster access credentials and certificates',
      rule: 'Read(**/.kube/config)'
    },
    {
      pattern: /\.kube\//,
      type: 'Kubernetes Configuration',
      risk: 'HIGH',
      explanation: 'Kubernetes cluster access configuration',
      rule: 'Read(**/.kube/**)'
    },
    {
      pattern: /\.minikube\//,
      type: 'Minikube Configuration',
      risk: 'HIGH',
      explanation: 'Local Kubernetes cluster certificates and keys',
      rule: 'Read(**/.minikube/**)'
    },
    
    // Cryptographic Keys and Certificates - CRITICAL
    {
      pattern: /\.gnupg\//,
      type: 'GPG Keys Directory',
      risk: 'CRITICAL',
      explanation: 'GPG private keys and encryption configuration',
      rule: 'Read(**/.gnupg/**)'
    },
    {
      pattern: /\.(pem|key|p12|pfx|crt|cer)$/,
      type: 'Certificate/Key Files',
      risk: 'CRITICAL',
      explanation: 'SSL certificates, private keys, and encryption files',
      rule: 'Read(**/*.{pem,key,p12,pfx,crt,cer})'
    },
    
    // Development and API Credentials - HIGH
    {
      pattern: /credentials\.(toml|json|yaml|yml|csv)$/,
      type: 'Credential Files',
      risk: 'CRITICAL',
      explanation: 'Application credentials and API keys',
      rule: 'Read(**/*credentials*)'
    },
    {
      pattern: /(auth_?token|access_?token)\.*/,
      type: 'Authentication Tokens',
      risk: 'CRITICAL',
      explanation: 'API tokens and authentication credentials',
      rule: 'Read(**/*token*)'
    },
    {
      pattern: /\.?secret/,
      type: 'Secret Files',
      risk: 'CRITICAL',
      explanation: 'Files containing secrets or sensitive configuration',
      rule: 'Read(**/*secret*)'
    },
    
    // Environment Variables - HIGH
    {
      pattern: /\.env(\.|$)/,
      type: 'Environment Variables',
      risk: 'HIGH',
      explanation: 'Environment variables that may contain API keys and passwords',
      rule: 'Read(**/.env*)'
    },
    
    // Shell History and Configs - MEDIUM
    {
      pattern: /\.(bash_history|zsh_history|fish_history|history)$/,
      type: 'Shell History',
      risk: 'MEDIUM',
      explanation: 'Command history that might contain passwords or secrets',
      rule: 'Read(**/*history*)'
    },
    
    // Version Control Credentials - HIGH
    {
      pattern: /\.gitconfig$/,
      type: 'Git Configuration',
      risk: 'MEDIUM',
      explanation: 'Git global configuration that may contain credentials',
      rule: 'Read(**/.gitconfig)'
    },
    {
      pattern: /\.git-credentials$/,
      type: 'Git Credentials',
      risk: 'CRITICAL',
      explanation: 'Stored Git credentials for repositories',
      rule: 'Read(**/.git-credentials)'
    },
    
    // Database Connection Files - HIGH
    {
      pattern: /\.(my\.cnf|pgpass)$/,
      type: 'Database Credentials',
      risk: 'CRITICAL',
      explanation: 'MySQL and PostgreSQL password files',
      rule: 'Read(**/.{my.cnf,pgpass})'
    },
    
    // Editor and IDE Configuration - MEDIUM
    {
      pattern: /\.vscode\/settings\.json$/,
      type: 'VS Code Settings',
      risk: 'MEDIUM',
      explanation: 'VS Code settings that might contain API keys',
      rule: 'Read(**/.vscode/settings.json)'
    },
    
    // Critical credential files only (simplified for performance)
    {
      pattern: /\.npmrc$/,
      type: 'NPM Configuration',
      risk: 'HIGH',
      explanation: 'NPM configuration with registry tokens and credentials',
      rule: 'Read(**/.npmrc)'
    },
    {
      pattern: /\.pypirc$/,
      type: 'PyPI Configuration', 
      risk: 'HIGH',
      explanation: 'Python package index credentials',
      rule: 'Read(**/.pypirc)'
    }
  ];

  /**
   * Detect project type based on file presence
   */
  async detectProjectType(projectPath: string): Promise<ProjectType> {
    const indicators = [
      { files: ['package.json', 'yarn.lock', 'package-lock.json'], type: 'web-development' as ProjectType },
      { files: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'], type: 'python' as ProjectType },
      { files: ['pom.xml', 'build.gradle', 'gradlew', '.gradle/', 'src/main/java/'], type: 'java' as ProjectType },
      { files: ['*.csproj', '*.sln', 'packages.config', 'nuget.config'], type: 'dotnet' as ProjectType },
      { files: ['Gemfile', 'Rakefile', 'config.ru', 'app/', 'config/'], type: 'ruby' as ProjectType },
      { files: ['composer.json', 'index.php', 'wp-config.php', '.htaccess'], type: 'php' as ProjectType },
      { files: ['Cargo.toml', 'src/main.rs', 'Cargo.lock'], type: 'rust' as ProjectType },
      { files: ['go.mod', 'go.sum', 'main.go', '*.go'], type: 'go' as ProjectType },
      { files: ['Package.swift', '*.xcodeproj', '*.xcworkspace', 'Podfile'], type: 'swift' as ProjectType },
      { files: ['Dockerfile', 'docker-compose.yml', 'k8s/', 'kubernetes/'], type: 'devops' as ProjectType },
      { files: ['main.tf', 'terraform/', '*.tfvars'], type: 'infrastructure' as ProjectType },
      { files: ['android/', 'ios/', 'pubspec.yaml', '*.xcodeproj'], type: 'mobile' as ProjectType },
      { files: ['jupyter/', '*.ipynb', 'requirements.txt', 'data/'], type: 'data-science' as ProjectType },
    ];

    try {
      const files = await fs.readdir(projectPath);
      
      for (const indicator of indicators) {
        for (const pattern of indicator.files) {
          if (files.some(file => file.includes(pattern.replace('*', '')) || file === pattern)) {
            return indicator.type;
          }
        }
      }
    } catch (error) {
      // Directory read error, default to general
    }

    return 'general';
  }

  /**
   * Scan a directory for sensitive files with progress tracking
   */
  async scanDirectory(directory: string, scope: FileScope = 'project'): Promise<ScanFile[]> {
    const results: ScanFile[] = [];
    const patterns = scope === 'project' ? this.projectPatterns : this.personalPatterns;
    const startTime = Date.now();
    
    console.log(`🔍 Scanning ${scope} directory: ${directory}`);
    
    try {
      await this.scanDirectoryRecursive(directory, directory, patterns, scope, results, 0, 3, startTime);
      
      const duration = Date.now() - startTime;
      console.log(`✅ ${scope} scan completed in ${formatDuration(duration)} - found ${results.length} sensitive ${results.length === 1 ? 'file' : 'files'}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.warn(`⚠️  ${scope} scan failed after ${formatDuration(duration)}:`, error instanceof Error ? error.message : String(error));
    }
    
    return results;
  }

  /**
   * Scan home directory for personal sensitive files
   * Only scan specific known sensitive directories to avoid hanging
   */
  async scanHomeDirectory(): Promise<ScanFile[]> {
    const homeDir = homedir();
    const results: ScanFile[] = [];
    
    // Only scan specific sensitive directories in home, not the entire home directory
    // Keep it fast by focusing on the most critical directories
    const sensitiveDirs = [
      '.ssh',
      '.aws',
      '.gcloud', 
      '.azure',
      '.docker',
      '.kube',
      '.minikube',
      '.gnupg'
      // Removed slower directories to prevent hanging
    ];

    const patterns = this.getPersonalPatterns();
    
    // Set a timeout for the entire home directory scan
    const scanTimeout = 10000; // 10 seconds timeout
    const startTime = Date.now();
    
    for (const dirName of sensitiveDirs) {
      // Check timeout before each directory
      if (Date.now() - startTime > scanTimeout) {
        console.warn(`Home directory scan timed out after ${formatDuration(scanTimeout)}, using partial results (found ${results.length} files)`);
        break;
      }
      
      const dirPath = join(homeDir, dirName);
      try {
        if (await this.pathExists(dirPath)) {
          // Limit depth to 1 for faster scanning to prevent hanging
          await this.scanDirectoryRecursive(dirPath, homeDir, patterns, 'personal', results, 0, 1);
        }
      } catch (error) {
        // Skip directories we can't access
        continue;
      }
    }
    
    // Also scan root level of home for common files like .env, etc.
    try {
      const homeFiles = await fs.readdir(homeDir);
      for (const file of homeFiles) {
        const fullPath = join(homeDir, file);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isFile()) {
            for (const pattern of patterns) {
              if (pattern.pattern.test(file)) {
                results.push({
                  fullPath,
                  relativePath: `~/${file}`,
                  type: pattern.type,
                  risk: pattern.risk,
                  scope: 'personal',
                  explanation: pattern.explanation,
                  suggestedRule: pattern.rule
                });
                break;
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      // Skip if can't read home directory
    }
    
    return results;
  }

  /**
   * Check if a path exists
   */
  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get patterns specifically for personal files
   */
  private getPersonalPatterns(): ScanPattern[] {
    return this.personalPatterns;
  }

  /**
   * Recursive directory scanning with improved error handling and timeouts
   */
  private async scanDirectoryRecursive(
    currentPath: string,
    rootPath: string, 
    patterns: ScanPattern[],
    scope: FileScope,
    results: ScanFile[],
    currentDepth: number,
    maxDepth: number,
    scanStartTime: number = Date.now(),
    maxScanTime: number = 10000 // Reduced to 10 seconds max per directory tree
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    // Check overall scan timeout
    if (Date.now() - scanStartTime > maxScanTime) {
      console.warn(`Scan timed out after ${formatDuration(maxScanTime)}, using partial results (found ${results.length} files so far)`);
      return;
    }

    try {
      // Add timeout to readdir operation
      const items = await this.timeoutPromise(
        fs.readdir(currentPath), 
        2000, // 2 second timeout per directory
        'readdir timeout'
      );
      
      for (const item of items) {
        // Quick timeout check during iteration
        if (Date.now() - scanStartTime > maxScanTime) {
          break;
        }

        const fullPath = join(currentPath, item);
        const relativePath = relative(rootPath, fullPath);
        
        // Skip common ignore patterns
        if (this.shouldSkipPath(relativePath)) continue;

        try {
          // Check if we have permission to access this path first
          if (!await this.hasPermission(fullPath)) {
            continue;
          }

          // Add timeout to stat operation
          const stat = await this.timeoutPromise(
            fs.stat(fullPath),
            1000, // 1 second timeout per file
            'stat timeout'
          );
          
          if (stat.isFile()) {
            // Check file against patterns
            for (const pattern of patterns) {
              if (pattern.pattern.test(item) || pattern.pattern.test(relativePath)) {
                results.push({
                  fullPath,
                  relativePath: scope === 'personal' ? `~/${relativePath}` : relativePath,
                  type: pattern.type,
                  risk: pattern.risk,
                  scope,
                  explanation: pattern.explanation,
                  suggestedRule: pattern.rule
                });
                break; // Only match first pattern
              }
            }
          } else if (stat.isDirectory()) {
            // Skip problematic directories that commonly cause hanging
            if (this.isProblematicDirectory(fullPath, relativePath)) {
              continue;
            }
            
            // Recurse into subdirectory with timeout propagation
            await this.scanDirectoryRecursive(
              fullPath, 
              rootPath, 
              patterns, 
              scope, 
              results, 
              currentDepth + 1, 
              maxDepth,
              scanStartTime,
              maxScanTime
            );
          }
        } catch (error) {
          // Log permission errors if verbose mode, but continue
          if ((error as any).code === 'EACCES' || (error as any).code === 'EPERM') {
            // Skip permission denied errors silently
            continue;
          }
          // Skip other errors (file not found, etc.)
          continue;
        }
      }
    } catch (error) {
      // Handle directory access errors
      if ((error as any).code === 'EACCES' || (error as any).code === 'EPERM') {
        // Permission denied - skip silently
        return;
      }
      if (error instanceof Error && error.message.includes('timeout')) {
        const elapsed = Date.now() - scanStartTime;
        console.warn(`Directory scan timed out after ${formatDuration(elapsed)}: ${currentPath}`);
        return;
      }
      // Skip other directory read errors
      return;
    }
  }

  /**
   * Helper to add timeout to promises
   */
  private async timeoutPromise<T>(
    promise: Promise<T>, 
    timeoutMs: number, 
    errorMsg: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
      )
    ]);
  }

  /**
   * Check if we have permission to access a path
   */
  private async hasPermission(path: string): Promise<boolean> {
    try {
      await fs.access(path, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if directory is known to cause problems
   */
  private isProblematicDirectory(fullPath: string, relativePath: string): boolean {
    const problematicPatterns = [
      // Virtual filesystems
      /\/proc\//,
      /\/sys\//,
      /\/dev\//,
      // Large cache directories
      /\/\.cache\//,
      /\/Cache\//,
      /\/Caches\//,
      // Virtual machine files
      /\/\.vagrant\//,
      /\/VirtualBox\//,
      /\/VMware\//,
      // Docker containers
      /\/\.docker\/containers\//,
      // Large development directories
      /\/node_modules\//,
      /\/\.git\/objects\//,
      /\/build\//,
      /\/dist\//,
      // macOS specific
      /\/\.Trash\//,
      /\/Library\/Caches\//,
      /\/Library\/Application Support\/.*\/Cache/,
      // Suspended processes
      /\/\.Spotlight-V100\//,
      /\/\.fseventsd\//,
    ];

    return problematicPatterns.some(pattern => 
      pattern.test(fullPath) || pattern.test(relativePath)
    );
  }

  /**
   * Check if a path should be skipped during scanning
   */
  private shouldSkipPath(relativePath: string): boolean {
    const skipPatterns = [
      /^\.git\//,
      /^\.next\//,
      /^\.vscode\//,
      /^\.idea\//,
      /^dist\//,
      /^build\//,
      /^coverage\//,
      /^__pycache__\//,
      /^\.pytest_cache\//,
      /^\.tox\//,
      /^venv\//,
      /^\.venv\//,
      // Skip node_modules unless we're specifically looking for it
      /^node_modules\//,
    ];

    return skipPatterns.some(pattern => pattern.test(relativePath));
  }

  /**
   * Combine scan results from multiple sources
   */
  combineScanResults(projectFiles: ScanFile[], personalFiles: ScanFile[]): ScanResult {
    const allFiles = [...projectFiles, ...personalFiles];
    
    // Calculate summary statistics
    const summary = {
      totalFiles: allFiles.length,
      criticalFiles: allFiles.filter(f => f.risk === 'CRITICAL').length,
      highFiles: allFiles.filter(f => f.risk === 'HIGH').length,
      mediumFiles: allFiles.filter(f => f.risk === 'MEDIUM').length,
      lowFiles: allFiles.filter(f => f.risk === 'LOW').length,
      projectFiles: projectFiles.length,
      personalFiles: personalFiles.length,
    };

    return {
      projectType: 'general', // Will be set by caller
      files: allFiles,
      projectFiles,
      personalFiles,
      summary
    };
  }

  /**
   * Get project-specific recommendations
   */
  getProjectRecommendations(projectType: ProjectType): string[] {
    const recommendations: Record<ProjectType, string[]> = {
      'web-development': [
        'Protect .env files containing API keys and database passwords',
        'Secure config/ directory with database credentials',
        'Consider protecting node_modules from accidental writes',
        'BINARY SECURITY: Monitor .node native modules and WebAssembly files - unanalyzable by AI source analysis',
        'Use npm audit and tools like CVE Binary Tool for dependency vulnerability scanning'
      ],
      'python': [
        'Protect .env files and configuration files',
        'Secure virtual environment directories if they contain credentials',
        'Protect any model files or data processing outputs with sensitive data',
        'BINARY SECURITY: Monitor .whl wheels and .pyd/.so native extensions (lxml, numpy, scipy) - C code vulnerabilities invisible to AI',
        'Use safety check and bandit for Python security, but supplement with binary analysis tools'
      ],
      'devops': [
        'Secure Terraform state files containing infrastructure secrets',
        'Protect Docker and Kubernetes configuration files',
        'Secure any CI/CD configuration with secrets',
        'BINARY SECURITY: Monitor container images and compiled binaries - multi-layer security risks in containerized applications',
        'Use container security scanners like Clair or Trivy for binary vulnerability analysis'
      ],
      'infrastructure': [
        'Critical: Protect all Terraform state files',
        'Secure cloud provider configuration files',
        'Protect any inventory or configuration management files',
        'BINARY SECURITY: Monitor infrastructure binaries and compiled tools - automation tools may contain unanalyzable security risks'
      ],
      'mobile': [
        'Secure keystore files and signing certificates',
        'Protect configuration files with API endpoints',
        'Secure any firebase or cloud configuration files',
        'BINARY SECURITY: Monitor .ipa/.apk packages and native libraries - compiled mobile apps require specialized security analysis',
        'Use mobile security scanners like MobSF for comprehensive binary analysis'
      ],
      'data-science': [
        'Protect datasets containing personal or sensitive information', 
        'Secure model files and training data',
        'Protect Jupyter notebook outputs that might contain data samples',
        'BINARY SECURITY: Monitor ML model binaries and native compute libraries - AI/ML dependencies often include unanalyzable native code',
        'Scientific computing libraries (numpy, scipy, pandas) contain C/Fortran code that requires binary security scanning'
      ],
      'java': [
        'Secure application.properties files containing database credentials',
        'Protect Java keystore files (.jks, .keystore) with signing certificates',
        'Secure gradle.properties and Maven settings with repository credentials',
        'BINARY SECURITY: Monitor .jar/.war files and JNI native libraries (.so/.dll) - AI tools cannot analyze compiled bytecode for vulnerabilities',
        'Use binary security scanners like OWASP Dependency Check for JAR vulnerability scanning'
      ],
      'dotnet': [
        'Protect Web.config and app.config files with connection strings',
        'Secure appsettings.json files containing API keys and secrets',
        'Protect connectionStrings.config files with database credentials',
        'BINARY SECURITY: Monitor .dll/.exe assemblies and P/Invoke native dependencies - IL analysis differs from source analysis',
        'Consider using tools like BinSkim for .NET binary security analysis'
      ],
      'ruby': [
        'Critical: Secure config/database.yml with database credentials',
        'Protect config/secrets.yml containing application secrets',
        'Secure any Rails credential files and environment-specific configs',
        'BINARY SECURITY: Monitor native gem extensions (.so/.bundle) - AI tools cannot analyze C extension vulnerabilities'
      ],
      'php': [
        'Critical: Secure wp-config.php with WordPress database credentials',
        'Protect .htaccess files that may contain sensitive directives',
        'Secure any Laravel .env files and configuration directories',
        'BINARY SECURITY: Monitor PHP extensions (.so/.dll) - native code vulnerabilities invisible to source analysis'
      ],
      'rust': [
        'Protect Cargo.toml files if they contain registry credentials',
        'Consider protecting target/ directory if it contains sensitive build artifacts',
        'Secure any configuration files in project root',
        'BINARY SECURITY: Monitor target/ compiled binaries and .rlib files - LLVM-compiled code unanalyzable by AI tools',
        'Use cargo audit for dependency vulnerability scanning of compiled crates'
      ],
      'go': [
        'Protect any configuration files containing API keys or secrets',
        'Secure vendor directory if it contains modified dependencies',
        'Protect any deployment or infrastructure configuration files',
        'BINARY SECURITY: Monitor CGO dependencies and compiled binaries - native C integration creates security blind spots',
        'Use tools like govulncheck for Go binary vulnerability analysis'
      ],
      'swift': [
        'Critical: Protect .xcconfig files with build and signing configurations',
        'Secure iOS certificates (.mobileprovision, .p12, .cer)',
        'Protect GoogleService-Info.plist and similar API configuration files',
        'BINARY SECURITY: Monitor .framework/.bundle files and native libraries - compiled Swift code unanalyzable by AI'
      ],
      'general': [
        'Protect any configuration files containing credentials',
        'Secure log files that might contain sensitive data',
        'Protect backup files and database dumps',
        'CRITICAL BINARY SECURITY: Monitor all binary files (.so/.dll/.dylib/.wasm/.exe) - AI tools cannot analyze compiled code for vulnerabilities',
        'Use comprehensive binary security scanners: BinSkim (.NET), CVE Binary Tool (cross-platform), OWASP Dependency Check',
        'Implement hybrid security approach: combine AI source analysis with specialized binary vulnerability scanning',
        'Consider platform-specific binary analysis: Wasmati (WebAssembly), MobSF (mobile), Clair/Trivy (containers)',
        'Regularly audit native dependencies and third-party binaries for known CVEs and supply chain risks'
      ]
    };

    return recommendations[projectType] || recommendations['general'];
  }
}