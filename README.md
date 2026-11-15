# shadow-code
A Solo Leveling-inspired RPG for mastering programming through quests, XP, and coding challenges.

## Ranked coding execution security

Ranked challenge submissions are evaluated in a separate Python subprocess with a timeout and restricted Python-level imports and file access. This reduces accidental access but is not a security boundary: the subprocess still runs with the backend host account's operating-system permissions. Do not expose ranked execution to untrusted users in production until it is isolated with an OS/container sandbox, resource limits, and restricted filesystem/network access.
