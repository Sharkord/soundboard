import { expect, test } from "bun:test";
import type { TSound } from "./contract";
import { groupSounds } from "./groups";

const sound = (id: string, categoryId?: string): TSound => ({
  id,
  name: id,
  categoryId,
  uploaderId: 1,
  durationMs: 1000,
  createdAt: 0,
});

const titlesAndIds = (groups: ReturnType<typeof groupSounds>) =>
  groups.map((group) => [group.title, group.sounds.map((s) => s.id)]);

test("favorites, then categories by name, then the rest", () => {
  const categories = [
    { id: "m", name: "Memes" },
    { id: "a", name: "Anime" },
    { id: "empty", name: "Empty" },
  ];
  const sounds = [
    sound("bruh", "m"),
    sound("airhorn"),
    sound("nani", "a"),
    sound("wow", "m"),
    sound("gone", "deleted-category"),
  ];

  expect(titlesAndIds(groupSounds(sounds, categories, ["wow"]))).toEqual([
    ["Favorites", ["wow"]],
    ["Anime", ["nani"]],
    ["Memes", ["bruh"]],
    ["Other", ["airhorn", "gone"]],
  ]);
});

test("a single group gets no heading, and nothing gives no groups", () => {
  expect(titlesAndIds(groupSounds([sound("b"), sound("a")], [], []))).toEqual([
    [undefined, ["a", "b"]],
  ]);
  expect(groupSounds([], [], [])).toEqual([]);
});
