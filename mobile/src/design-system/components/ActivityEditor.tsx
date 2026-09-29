/**
 * ActivityEditor: editing a session's title and notes (#25).
 *
 * Shared by the end-of-session summary and the detail: it's the same gesture, and
 * duplicating it would let the 120-character limit diverge from one screen to the other.
 *
 * Saving only sends the fields actually changed: the backend treats "absent" as "don't
 * touch", so sending both every time would overwrite a note another session just wrote.
 */
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '../theme';
import { useTheme } from '../use-theme';
import { Button } from './Button';
import { Input } from './Input';

/** Same bound as V6's SQL constraint and the DTO's `@Size`. */
export const TITLE_MAX_LENGTH = 120;

interface Props {
  visible: boolean;
  initialTitle: string | null;
  initialNotes: string | null;
  /** Title field placeholder: the derived label, to show the current fallback. */
  titlePlaceholder: string;
  onCancel: () => void;
  onSave: (patch: { title?: string; notes?: string }) => void;
  saving?: boolean;
}

/** Only returns what changed; see the header on the PATCH semantics. */
export function buildPatch(
  next: { title: string; notes: string },
  initial: { title: string | null; notes: string | null },
): { title?: string; notes?: string } {
  const patch: { title?: string; notes?: string } = {};
  if (next.title !== (initial.title ?? '')) {
    patch.title = next.title;
  }
  if (next.notes !== (initial.notes ?? '')) {
    patch.notes = next.notes;
  }
  return patch;
}

export function ActivityEditor({
  visible,
  initialTitle,
  initialNotes,
  titlePlaceholder,
  onCancel,
  onSave,
  saving = false,
}: Props) {
  const theme = useTheme();
  const [title, setTitle] = React.useState(initialTitle ?? '');
  const [notes, setNotes] = React.useState(initialNotes ?? '');

  // Realigns the fields when the modal reopens: otherwise a cancelled edit would leave its
  // input in place on the next opening.
  React.useEffect(() => {
    if (visible) {
      setTitle(initialTitle ?? '');
      setNotes(initialNotes ?? '');
    }
  }, [visible, initialTitle, initialNotes]);

  const tooLong = title.length > TITLE_MAX_LENGTH;
  const patch = buildPatch({ title, notes }, { title: initialTitle, notes: initialNotes });
  const hasChanges = Object.keys(patch).length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          testID="activity-editor"
          style={[styles.sheet, { backgroundColor: theme.surfaceCard }]}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={[typography.h3, { color: theme.textPrimary }]}>Modifier la séance</Text>

            <Input
              label="Titre"
              testID="title-input"
              value={title}
              onChangeText={setTitle}
              placeholder={titlePlaceholder}
              maxLength={TITLE_MAX_LENGTH + 1} // +1 so that exceeding is reachable and reported
              error={tooLong ? `${TITLE_MAX_LENGTH} caractères maximum.` : undefined}
              helper={
                title.length === 0 ? 'Sans titre, la date et le sport servent de libellé.' : undefined
              }
            />

            <Input
              label="Notes"
              testID="notes-input"
              value={notes}
              onChangeText={setNotes}
              placeholder="Sensations, météo, matériel…"
              multiline
              numberOfLines={4}
            />

            <View style={styles.actions}>
              <Button variant="secondary" onPress={onCancel}>
                Annuler
              </Button>
              <Button
                onPress={() => onSave(patch)}
                disabled={!hasChanges || tooLong || saving}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' },
  content: { padding: spacing.layoutGutter, gap: spacing.base },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
});
