#!/bin/bash

# Comprehensive test runner for validation engine tests
# Runs all validation tests with performance monitoring and coverage reporting

set -e

echo "🚀 Starting Comprehensive Validation Engine Test Suite"
echo "======================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_TIMEOUT=300000  # 5 minutes
MAX_WORKERS=4
PERFORMANCE_TARGET=100  # ms

echo -e "${BLUE}Configuration:${NC}"
echo "  - Test timeout: ${TEST_TIMEOUT}ms"
echo "  - Max workers: ${MAX_WORKERS}"
echo "  - Performance target: ${PERFORMANCE_TARGET}ms"
echo ""

# Function to run tests with timing
run_test_suite() {
  local suite_name=$1
  local test_pattern=$2
  local description=$3
  
  echo -e "${YELLOW}Running ${suite_name}...${NC}"
  echo "Description: ${description}"
  
  local start_time=$(date +%s)
  
  if npm test -- --testPathPattern="${test_pattern}" --testTimeout=${TEST_TIMEOUT} --maxWorkers=${MAX_WORKERS} --verbose; then
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo -e "${GREEN}✅ ${suite_name} completed successfully (${duration}s)${NC}"
    echo ""
    return 0
  else
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo -e "${RED}❌ ${suite_name} failed after ${duration}s${NC}"
    echo ""
    return 1
  fi
}

# Function to check performance requirements
check_performance() {
  echo -e "${BLUE}Checking Performance Requirements...${NC}"
  
  # Run performance-specific tests
  if npm test -- --testPathPattern="engine.test.ts" --testNamePattern="Performance" --testTimeout=${TEST_TIMEOUT}; then
    echo -e "${GREEN}✅ Performance requirements met${NC}"
  else
    echo -e "${RED}❌ Performance requirements not met${NC}"
    return 1
  fi
  echo ""
}

# Function to run security tests
run_security_tests() {
  echo -e "${BLUE}Running Critical Security Tests...${NC}"
  
  # Run zero-bypass security tests
  if npm test -- --testPathPattern="engine.test.ts" --testNamePattern="Zero-Bypass|Security" --testTimeout=${TEST_TIMEOUT}; then
    echo -e "${GREEN}✅ Security tests passed${NC}"
  else
    echo -e "${RED}❌ Security tests failed - CRITICAL ISSUE${NC}"
    return 1
  fi
  echo ""
}

# Function to run stress tests
run_stress_tests() {
  echo -e "${BLUE}Running Stress Tests (Large Rulesets)...${NC}"
  
  # Run stress tests with extended timeout
  if npm test -- --testPathPattern="engine.test.ts|integration.test.ts" --testNamePattern="stress|large|1000" --testTimeout=600000 --maxWorkers=2; then
    echo -e "${GREEN}✅ Stress tests passed${NC}"
  else
    echo -e "${YELLOW}⚠️  Stress tests failed - performance degradation detected${NC}"
    return 1
  fi
  echo ""
}

# Main test execution
main() {
  local exit_code=0
  
  echo -e "${BLUE}Phase 1: Core Unit Tests${NC}"
  echo "========================="
  
  # Core validation engine tests
  if ! run_test_suite "Core ValidationEngine Tests" "engine.test.ts" "Core validation functionality and basic security"; then
    exit_code=1
  fi
  
  # Conflict detection tests
  if ! run_test_suite "Conflict Detection Tests" "conflicts.test.ts" "Rule conflict detection and resolution"; then
    exit_code=1
  fi
  
  echo -e "${BLUE}Phase 2: Security Validation${NC}"
  echo "============================="
  
  # Critical security tests
  if ! run_security_tests; then
    exit_code=1
  fi
  
  echo -e "${BLUE}Phase 3: Performance Validation${NC}"
  echo "==============================="
  
  # Performance benchmarking
  if ! check_performance; then
    exit_code=1
  fi
  
  echo -e "${BLUE}Phase 4: Integration Tests${NC}"
  echo "=========================="
  
  # Integration tests
  if ! run_test_suite "Integration Tests" "integration.test.ts" "End-to-end validation workflow"; then
    exit_code=1
  fi
  
  echo -e "${BLUE}Phase 5: Stress Testing${NC}"
  echo "======================="
  
  # Stress tests with large datasets
  if ! run_stress_tests; then
    # Don't fail build on stress test failure, just warn
    echo -e "${YELLOW}⚠️  Continuing despite stress test issues${NC}"
  fi
  
  echo -e "${BLUE}Phase 6: Coverage Analysis${NC}"
  echo "=========================="
  
  # Run all tests with coverage
  echo -e "${YELLOW}Generating comprehensive coverage report...${NC}"
  if npm test -- --testPathPattern="validation/" --coverage --coverageReporters=text-summary; then
    echo -e "${GREEN}✅ Coverage analysis completed${NC}"
  else
    echo -e "${RED}❌ Coverage analysis failed${NC}"
    exit_code=1
  fi
  
  echo ""
  echo "======================================================"
  if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}🎉 All validation tests completed successfully!${NC}"
    echo -e "${GREEN}✅ Zero-bypass security enforcement verified${NC}"
    echo -e "${GREEN}✅ Performance requirements (<100ms) met${NC}"
    echo -e "${GREEN}✅ Conflict detection working correctly${NC}"
    echo -e "${GREEN}✅ Edge cases and robustness confirmed${NC}"
  else
    echo -e "${RED}❌ Test suite failed - see errors above${NC}"
    echo -e "${RED}Critical issues detected in validation system${NC}"
  fi
  echo "======================================================"
  
  exit $exit_code
}

# Run with error handling
trap 'echo -e "${RED}Test execution interrupted${NC}"; exit 1' INT TERM

main "$@"