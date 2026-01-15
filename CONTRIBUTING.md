# Contributing to Task Management System

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Development Workflow

### 1. Fork and Clone

```bash
git clone https://github.com/your-username/task-management-system.git
cd task-management-system
npm install
```

### 2. Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### 3. Make Changes

- Write code following our coding standards
- Add tests for new functionality
- Update documentation if needed
- Test your changes locally

### 4. Commit Changes

```bash
git add .
git commit -m "feat: add your feature description"
```

Use conventional commit format:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `test:` for adding tests
- `refactor:` for code refactoring

### 5. Push and Create PR

```bash
git push -u origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Code Review Guidelines

### For Authors

- Provide clear PR description
- Include screenshots for UI changes
- Link related issues
- Ensure all tests pass
- Keep PRs focused and small

### For Reviewers

- Be constructive and respectful
- Test changes locally when possible
- Check for code quality and consistency
- Verify tests are adequate
- Approve when ready or request changes

## Coding Standards

### JavaScript

- Use ES6+ features
- Follow consistent naming conventions
- Add JSDoc comments for public methods
- Handle errors appropriately
- Write meaningful variable names

### Testing

- Write tests for new features
- Maintain test coverage above 80%
- Use descriptive test names
- Follow AAA pattern (Arrange-Act-Assert)

### Git

- Use meaningful commit messages
- Keep commits atomic (one logical change)
- Rebase feature branches before merging
- Delete branches after merging

## Getting Help

- Check existing issues and PRs
- Ask questions in PR comments
- Contact maintainers if needed

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Maintain a positive environment
