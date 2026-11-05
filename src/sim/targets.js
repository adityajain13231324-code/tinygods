import { groupOf } from './villager.js';

export function groupHasMembers(world, group) {
  return world.villagers.some(v => v.alive && groupOf(v) === group);
}

/** Public, deterministic target availability, including neutrals as group 4. */
export function livingGroups(world) {
  const present = new Set(world.villagers.filter(v => v.alive).map(groupOf));
  return [0, 1, 2, 3, 4].filter(group => present.has(group));
}
