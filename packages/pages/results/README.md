# @arrow-warfare/results

The end of a round: the winner (a player or a team) or a draw, and each player's kills, shots, hits, hit rate, longest shot, arrows picked up and time alive. The host goes on with a rematch or back to the lobby, the others wait.

```ts
const results = mountResults(root, { state, me, host, onBack, onRematch });
results.remove();
```

`state.results` comes from the host when the round ends.
