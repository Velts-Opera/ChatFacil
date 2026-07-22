```markdown
# ChatFacil Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the ChatFacil TypeScript codebase. It covers file naming, import/export styles, commit message conventions, and testing patterns. By following these guidelines, contributors can maintain consistency and quality across the project.

## Coding Conventions

### File Naming
- Use **kebab-case** for all file names.
  - Example:  
    ```plaintext
    chat-handler.ts
    user-profile.ts
    ```

### Import Style
- Use **relative imports** for referencing modules within the project.
  - Example:
    ```typescript
    import { sendMessage } from './chat-utils';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // chat-utils.ts
    export function sendMessage(msg: string) { ... }
    export const MAX_LENGTH = 200;
    ```

### Commit Messages
- Follow the **Conventional Commits** format.
- Use the `fix` prefix for bug fixes.
  - Example:
    ```
    fix: correct message formatting in chat handler
    ```

## Workflows

### Fixing Bugs
**Trigger:** When you identify and resolve a bug in the codebase  
**Command:** `/fix-bug`

1. Create a new branch for your fix.
2. Make the necessary code changes.
3. Write or update tests to cover the fix.
4. Commit your changes using the `fix:` prefix.
   - Example: `fix: resolve issue with message parsing`
5. Open a pull request for review.

### Adding or Modifying Features
**Trigger:** When implementing a new feature or updating existing functionality  
**Command:** `/add-feature`

1. Create a new branch for your feature.
2. Implement the feature using kebab-case file naming and relative imports.
3. Export new functions or constants as named exports.
4. Write or update tests in `*.test.*` files.
5. Commit your changes with an appropriate Conventional Commit message.
6. Open a pull request for review.

## Testing Patterns

- Test files follow the `*.test.*` naming pattern.
  - Example: `chat-handler.test.ts`
- The testing framework is not explicitly defined; ensure tests are colocated with or near the code they test.
- Write tests for all new features and bug fixes.

## Commands
| Command      | Purpose                                 |
|--------------|-----------------------------------------|
| /fix-bug     | Start the bug fixing workflow           |
| /add-feature | Start the feature addition workflow      |
```