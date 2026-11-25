import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  IconButton,
  Input,
  PaginatedList,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sharkord/ui";
import { Pencil, Play, Trash2 } from "lucide-react";
import { useStoreSelector } from "@sharkord/plugin-sdk/client";
import { memo, useMemo, useState } from "react";
import {
  MAX_NAME_LENGTH,
  type TCategory,
  type TSound,
  type TSoundChanges,
} from "../contract";
import { playSound } from "./audio";
import { CategorySelect, sortCategories } from "./categories";
import { SoundHotkeyButton } from "./hotkeys";
import {
  formatDuration,
  useErrorState,
  usePlaybackOptions,
  useStableCallback,
} from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";

// plain values and stable handlers only, so a row renders again when its own
// sound changes, not whenever the list or the store does
type TSoundRowProps = {
  sound: TSound;
  categories: TCategory[];
  /** shown when set, for lists of everyone's sounds */
  uploaderName: string | undefined;
  /** shown when set, for admins */
  playCount: number | undefined;
  /** lets the user bind a key to the sound, for their own list */
  showHotkey?: boolean;
  onDelete: (soundId: string) => Promise<void>;
  onUpdate: (soundId: string, changes: TSoundChanges) => Promise<void>;
  onPreview: (soundId: string) => Promise<unknown>;
};

const SoundRow = memo((props: TSoundRowProps) => {
  const {
    sound,
    categories,
    uploaderName,
    playCount,
    showHotkey,
    onDelete,
    onUpdate,
    onPreview,
  } = props;
  const { error, run } = useErrorState();
  // the name being typed, while renaming
  const [draftName, setDraftName] = useState<string>();

  const saveName = () =>
    run(async () => {
      if (draftName === undefined) return;

      setDraftName(undefined);

      if (draftName.trim() !== sound.name) {
        await onUpdate(sound.id, { name: draftName });
      }
    });

  return (
    <Row
      gap={12}
      style={{
        padding: "8px 12px",
        borderRadius: "var(--radius)",
        background: "var(--secondary)",
      }}
    >
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        {draftName === undefined ? (
          <span style={{ fontWeight: 500 }}>{sound.name}</span>
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
        <MutedText>
          {formatDuration(sound.durationMs)}
          {uploaderName !== undefined && ` · ${uploaderName}`}
          {playCount !== undefined &&
            ` · ${playCount} ${playCount === 1 ? "play" : "plays"}`}
        </MutedText>
        <ErrorText error={error} />
      </Stack>

      <CategorySelect
        categories={categories}
        value={sound.categoryId}
        size="sm"
        onChange={(categoryId) =>
          run(() => onUpdate(sound.id, { categoryId: categoryId ?? null }))
        }
      />

      {showHotkey && <SoundHotkeyButton soundId={sound.id} />}

      <IconButton
        icon={Pencil}
        size="sm"
        variant="ghost"
        title="Rename"
        onClick={() => setDraftName(sound.name)}
      />

      <IconButton
        icon={Play}
        size="sm"
        variant="ghost"
        title="Preview (only you hear it)"
        onClick={() => run(() => onPreview(sound.id))}
      />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <IconButton
            icon={Trash2}
            size="sm"
            variant="destructive"
            title="Delete"
          />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{sound.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed for everyone and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => onDelete(sound.id))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Row>
  );
});

// select items cannot have an empty value; ids are UUIDs, so these never clash
const ANY = "any";
const UNKNOWN_USER = "Unknown user";
const NO_CATEGORY = "none";

type TFilterSelectProps = {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
};

const FilterSelect = ({ value, options, onChange }: TFilterSelectProps) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger style={{ minWidth: 160 }}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

type TSoundListProps = Pick<
  TSoundRowProps,
  "categories" | "showHotkey" | "onDelete" | "onUpdate"
> & {
  sounds: TSound[];
  emptyText: string;
  /** names who uploaded each sound, for lists of everyone's */
  showUploader: boolean;
  /** how often each sound was played, for admins */
  playCounts?: Record<string, number>;
  /** search by name, and narrow by category and uploader, for long lists */
  filterable?: boolean;
};

// rows are rendered a page at a time: an admin list can run to hundreds
const SOUNDS_PER_PAGE = 20;

const matchesName = (sound: TSound, searchTerm: string) =>
  sound.name.toLowerCase().includes(searchTerm.trim().toLowerCase());

const SoundList = memo((props: TSoundListProps) => {
  const { sounds, emptyText, showUploader, playCounts, filterable } = props;
  const { categories, showHotkey, onDelete, onUpdate } = props;
  const users = useStoreSelector((state) => state.users);
  const playbackOptions = usePlaybackOptions();
  const [categoryId, setCategoryId] = useState(ANY);
  const [uploaderId, setUploaderId] = useState(ANY);

  // looked up once per list, not once per row
  const userNames = useMemo(
    () => new Map(users.map((user) => [user.id, user.name])),
    [users],
  );

  // the rows' only way to preview: they never subscribe to the volume
  const onPreview = useStableCallback((soundId: string) =>
    playSound(soundId, playbackOptions),
  );

  const uploaderOptions = useMemo(
    () =>
      [...new Set(sounds.map((sound) => sound.uploaderId))]
        .map((id) => ({
          value: String(id),
          label: userNames.get(id) ?? UNKNOWN_USER,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [sounds, userNames],
  );

  // the search is PaginatedList's own; these two narrow what it gets
  const filtered = useMemo(() => {
    const known = new Set(categories.map((category) => category.id));

    return sounds.filter(
      (sound) =>
        (categoryId === ANY ||
          (categoryId === NO_CATEGORY
            ? !sound.categoryId || !known.has(sound.categoryId)
            : sound.categoryId === categoryId)) &&
        (uploaderId === ANY || String(sound.uploaderId) === uploaderId),
    );
  }, [sounds, categories, categoryId, uploaderId]);

  return (
    <PaginatedList
      items={filtered}
      itemsPerPage={SOUNDS_PER_PAGE}
      searchFilter={matchesName}
    >
      {filterable && sounds.length > 0 && (
        <Row style={{ flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <PaginatedList.Search placeholder="Search sounds" />
          </div>
          {categories.length > 0 && (
            <FilterSelect
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: ANY, label: "All categories" },
                { value: NO_CATEGORY, label: "No category" },
                ...sortCategories(categories).map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
            />
          )}
          {showUploader && (
            <FilterSelect
              value={uploaderId}
              onChange={setUploaderId}
              options={[{ value: ANY, label: "Everyone" }, ...uploaderOptions]}
            />
          )}
        </Row>
      )}

      <PaginatedList.Empty className="text-sm">
        {sounds.length === 0 ? emptyText : "No sound matches these filters."}
      </PaginatedList.Empty>

      <PaginatedList.List<TSound>
        className="flex flex-col gap-2"
        getItemKey={(sound) => sound.id}
      >
        {(sound) => (
          <SoundRow
            sound={sound}
            categories={categories}
            uploaderName={
              showUploader
                ? (userNames.get(sound.uploaderId) ?? UNKNOWN_USER)
                : undefined
            }
            playCount={playCounts ? (playCounts[sound.id] ?? 0) : undefined}
            showHotkey={showHotkey}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onPreview={onPreview}
          />
        )}
      </PaginatedList.List>

      <PaginatedList.Pagination className="mt-2" />
    </PaginatedList>
  );
});

export { SoundList };
