import React, { useState } from 'react';
import { View } from 'react-native';
import { Alert } from '../ui/dialog';
import { createExpenseCategory, deleteExpenseCategory, listExpenseCategories } from '../domain/expenses';
import { useApp, useData } from '../state/app';
import { space } from '../theme';
import { Field } from '../ui/forms';
import { Button, Card, ListRow, Loading } from '../ui/primitives';
import { Screen } from '../ui/Screen';

export default function Categories() {
  const { mutate } = useApp();
  const { data } = useData((db) => listExpenseCategories(db));
  const [name, setName] = useState('');
  return (
    <Screen title="Expense categories" back>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field placeholder="New category" value={name} onChangeText={setName} />
        </View>
        <Button
          title="Add"
          small
          full={false}
          disabled={!name.trim()}
          style={{ minHeight: 50 }}
          onPress={async () => {
            if (await mutate((db) => createExpenseCategory(db, name), { success: 'Category added' })) setName('');
          }}
        />
      </View>
      {!data ? (
        <Loading />
      ) : (
        <Card padded={false}>
          {data.map((c, i) => (
            <ListRow
              key={c.id}
              icon="folder-outline"
              title={c.name}
              subtitle={`${c.usage} expense(s)${c.is_default ? ' · default' : ''}`}
              right={c.usage === 0 ? 'Delete' : undefined}
              rightTone="negative"
              onPress={
                c.usage === 0
                  ? () =>
                      Alert.alert(`Delete “${c.name}”?`, undefined, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => mutate((db) => deleteExpenseCategory(db, c.id), { success: 'Category deleted' }) },
                      ])
                  : undefined
              }
              chevron={false}
              last={i === data.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
