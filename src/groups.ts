import type { TCategory, TSound } from "./contract";

type TSoundGroup = {
  /** stable across renames, to remember a group the user collapsed */
  id: string;
  /** undefined when the sounds are not split up, so no heading is needed */
  title: string | undefined;
  sounds: TSound[];
};

// a key no category id (a UUID) can be
const OTHER = "";

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * How the soundboard lays sounds out: favorites first, then the user's recent
 * plays, then each category by name, then "Other" for sounds in none.
 *
 * A favorite is listed once, under Favorites. A recent sound stays in its
 * group too, so playing one never moves it from where the user looks for it.
 * Empty groups are dropped, and a lone group needs no heading.
 */
const groupSounds = (
  sounds: TSound[],
  categories: TCategory[],
  favorites: string[],
  recent: string[] = [],
): TSoundGroup[] => {
  const favoriteIds = new Set(favorites);
  const isFavorite = (sound: TSound) => favoriteIds.has(sound.id);
  const byId = new Map(sounds.map((sound) => [sound.id, sound]));
  const rest = sounds.filter((sound) => !isFavorite(sound)).sort(byName);
  // a sound can point at a category deleted since, which counts as none
  const known = new Set(categories.map((category) => category.id));
  // one pass over the sounds, not one per category
  const byCategory = Map.groupBy(rest, (sound) =>
    sound.categoryId && known.has(sound.categoryId) ? sound.categoryId : OTHER,
  );

  const groups: TSoundGroup[] = [
    {
      id: "favorites",
      title: "Favorites",
      sounds: sounds.filter(isFavorite).sort(byName),
    },
    {
      id: "recent",
      title: "Recent",
      // most recent first, as played
      sounds: recent.flatMap((id) => byId.get(id) ?? []),
    },
    ...[...categories].sort(byName).map((category) => ({
      id: category.id,
      title: category.name,
      sounds: byCategory.get(category.id) ?? [],
    })),
    { id: "other", title: "Other", sounds: byCategory.get(OTHER) ?? [] },
  ].filter((group) => group.sounds.length > 0);

  return groups.length === 1 ? [{ ...groups[0]!, title: undefined }] : groups;
};

export { groupSounds };
export type { TSoundGroup };
