# Contributing to InstaNotLM

Thank you for your interest in contributing to InstaNotLM! This document provides guidelines and instructions for contributing.

## How to Report Bugs

1. **Check existing issues** - Search to see if the bug has already been reported
2. **Create a detailed bug report** with:
   - Clear title describing the issue
   - Step-by-step reproduction instructions
   - Expected vs actual behavior
   - Screenshots (if applicable)
   - Browser version and OS
   - Extension version

## How to Suggest Features

1. **Check the roadmap** - See if the feature is already planned
2. **Open a discussion** or issue with:
   - Clear description of the feature
   - Why it would be useful
   - Example use case

## How to Contribute Code

### Setup for Development

```bash
# Clone the repository
git clone https://github.com/elton2024br/instanotLM.git
cd instanotLM

# Install dependencies
npm install

# For Python pipeline
cd python-pipeline
pip install -r requirements.txt
```

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Add comments for complex logic
   - Follow existing code style

3. **Test your changes**
   - Test locally in Chrome Dev Mode
   - Test different profile types
   - Test with different post counts

4. **Commit with clear messages**
   ```bash
   git commit -m "feat: describe your changes clearly"
   ```
   - Use conventional commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`

5. **Push and create a Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

### Pull Request Guidelines

- Link related issues ("Fixes #123")
- Describe what changed and why
- Include screenshots for UI changes
- Ensure code follows project style
- Request review from maintainers

## Code Standards

### JavaScript/TypeScript
- Use modern ES6+ syntax
- Add JSDoc comments for functions
- Aim for meaningful variable names
- Keep functions focused and small

### Python
- Follow PEP 8
- Use type hints where possible
- Add docstrings to functions

## Documentation

If you're fixing a bug or adding a feature, update relevant docs:
- README.md (user-facing features)
- Code comments (implementation details)
- CHANGELOG.md (breaking changes)

## Community Standards

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and improve
- Focus on the code, not the person

## Questions?

Open an issue or start a discussion - we're here to help!

Thank you for contributing! 🙏
