/**
 * ActivityEditor — édition du titre et des notes d'une séance (#25).
 *
 * Partagé par le résumé de fin de séance et le détail : c'est le même geste, et le
 * dupliquer ferait diverger la limite de 120 caractères d'un écran à l'autre.
 *
 * L'enregistrement n'envoie que les champs réellement modifiés — le backend traite
 * « absent » comme « ne pas toucher », donc envoyer les deux à chaque fois écraserait
 * une note qu'une autre session viendrait d'écrire.
 */
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '../theme';
import { useTheme } from '../use-theme';
import { Button } from './Button';
import { Input } from './Input';

/** Même borne que la contrainte SQL de V6 et le `@Size` du DTO. */
export const TITLE_MAX_LENGTH = 120;

interface Props {
  visible: boolean;
  initialTitle: string | null;
  initialNotes: string | null;
  /** Placeholder du champ titre : le libellé dérivé, pour montrer le repli actuel. */
  titlePlaceholder: string;
  onCancel: () => void;
  onSave: (patch: { title?: string; notes?: string }) => void;
  saving?: boolean;
}

/** Ne renvoie que ce qui a bougé — voir l'en-tête sur la sémantique du PATCH. */
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

  // Réaligne les champs quand la modale se rouvre : sans ça, une édition annulée
  // laisserait sa saisie en place à la réouverture suivante.
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
              maxLength={TITLE_MAX_LENGTH + 1} // +1 pour que le dépassement soit atteignable et signalé
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
