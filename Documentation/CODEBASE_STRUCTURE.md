# CODEBASE_STRUCTURE.md

## File Organization
- **src/**: Contains all source code files for the ShardsIdle project.
- **tests/**: Contains unit and integration tests.
- **docs/**: Contains documentation files.
- **assets/**: Contains all assets like images, sounds, etc.

## Architecture
- The application follows a modular architecture where each module represents a specific feature of the game. 
- Components are reusable and can be imported wherever needed.
- Utilizes a Game Manager to handle game state and transitions.

## Dead Functions
- List of functions that are no longer in use or intended to be removed:
  - `calculateOldScore()`: Legacy scoring method that is not used anymore.
  - `renderDeprecatedUI()`: Old UI rendering function that was replaced.

## Monster Functions
- Functions identified with complex logic and too many responsibilities:
  - `updateGameState()`: Handles multiple aspects of the game state, needs to be broken down into smaller functions.

## Refactoring Roadmap
1. **Q2 2026** - Refactor `updateGameState()` into smaller, single-responsibility functions.
2. **Q3 2026** - Review and remove all dead functions to clean up the codebase.
3. **Q4 2026** - Introduce better documentation practices for new functions and modules.