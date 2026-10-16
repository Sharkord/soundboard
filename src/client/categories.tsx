import {
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sharkord/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { MAX_NAME_LENGTH, type TCategory } from "../contract";
import { callAction, useErrorState } from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";

// a select item cannot have an empty value, so "no category" needs a stand-in
const NO_CATEGORY = "none";

/** Categories in the order every list shows them. */
const sortCategories = (categories: TCategory[]) =>
  [...categories].sort((a, b) => a.name.localeCompare(b.name));

type TCategorySelectProps = {
  categories: TCategory[];
  value: string | undefined;
  onChange: (categoryId: string | undefined) => void;
  size?: "sm" | "default";
};

/** Picks a sound's category, or none. Renders nothing while none exist. */
const CategorySelect = memo(
  ({ categories, value, onChange, size }: TCategorySelectProps) => {
    if (categories.length === 0) return null;

    return (
      <Select
        value={value ?? NO_CATEGORY}
        onValueChange={(next) =>
          onChange(next === NO_CATEGORY ? undefined : next)
        }
      >
        <SelectTrigger size={size} style={{ minWidth: 140 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY}>No category</SelectItem>
          {sortCategories(categories).map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  },
);

const CategoryRow = memo(({ category }: { category: TCategory }) => {
  const { error, run } = useErrorState();
  // the name being typed, while renaming
  const [draftName, setDraftName] = useState<string>();

  const saveName = () =>
    run(async () => {
      if (draftName === undefined) return;

      setDraftName(undefined);

      if (draftName.trim() !== category.name) {
        await callAction("renameCategory", {
          categoryId: category.id,
          name: draftName,
        });
      }
    });

  return (
    <Stack gap={2}>
      <Row>
        {draftName === undefined ? (
          <span style={{ flex: 1, fontWeight: 500 }}>{category.name}</span>
        ) : (
          <Input
            value={draftName}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            onChange={(event) => setDraftName(event.target.value)}
            onEnter={saveName}
            onBlur={saveName}
            onKeyUp={(event) => {
              if (event.key === "Escape") setDraftName(undefined);
            }}
          />
        )}
        <IconButton
          icon={Pencil}
          size="sm"
          variant="ghost"
          title="Rename"
          onClick={() => setDraftName(category.name)}
        />
        <IconButton
          icon={Trash2}
          size="sm"
          variant="destructive"
          title="Delete (its sounds are kept, in no category)"
          onClick={() =>
            run(() => callAction("deleteCategory", { categoryId: category.id }))
          }
        />
      </Row>
      <ErrorText error={error} />
    </Stack>
  );
});

/** Adds, renames and deletes categories, for the admin tab. */
const CategoryManager = memo(({ categories }: { categories: TCategory[] }) => {
  const { error, run } = useErrorState();
  const [name, setName] = useState("");

  const create = () =>
    run(async () => {
      await callAction("createCategory", { name });
      setName("");
    });

  return (
    <Stack gap={8}>
      <Row>
        <Input
          placeholder="New category"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
          onEnter={create}
        />
        <Button onClick={create} disabled={!name.trim()}>
          <Plus />
          Add
        </Button>
      </Row>
      <ErrorText error={error} />

      {sortCategories(categories).map((category) => (
        <CategoryRow key={category.id} category={category} />
      ))}

      {categories.length === 0 && (
        <MutedText>
          No categories yet. Sounds in none are listed under "Other".
        </MutedText>
      )}
    </Stack>
  );
});

export { CategoryManager, CategorySelect, sortCategories };
