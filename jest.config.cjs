module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/scripts/repo-configure/tests/**/*.test.cjs'],
  collectCoverageFrom: ['dist/scripts/repo-configure/src/**/*.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text'],
  coverageProvider: 'babel'
};
