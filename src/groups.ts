import type { TCategory, TSound } from "./contract";

type TSoundGroup = {
  /** undefined when the sounds are not split up, so no heading is needed */
  title: string | undefined;
  sounds: TSound[];
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/**
 * How the soundboard lays sounds out: favorites first, then each category by
 * name, then "Other" for sounds in none. A favorite is listed once, under
 * Favorites. Empty groups are dropped, and a lone group needs no heading.
 */
const groupSounds = (
  sounds: TSound[],
  categories: TCategory[],
  favorites: string[],
): TSoundGroup[] => {
  const isFavorite = (sound: TSound) => favorites.includes(sound.id);
  const rest = sounds.filter((sound) => !isFavorite(sound));
  // a sound can point at a category deleted since, which counts as none
  const known = new Set(categories.map((category) => category.id));

  const groups: TSoundGroup[] = [
    { title: "Favorites", sounds: sounds.filter(isFavorite) },
    ...[...categories].sort(byName).map((category) => ({
      title: category.name,
      sounds: rest.filter((sound) => sound.categoryId === category.id),
    })),
    {
      title: "Other",
      sounds: rest.filter(
        (sound) => !sound.categoryId || !known.has(sound.categoryId),
      ),
    },
  ]
    .filter((group) => group.sounds.length > 0)
    .map((group) => ({ ...group, sounds: [...group.sounds].sort(byName) }));

  return groups.length === 1 ? [{ ...groups[0]!, title: undefined }] : groups;
};

export { groupSounds };
export type { TSoundGroup };
