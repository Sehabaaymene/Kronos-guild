import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ExpenseForm } from '../../ui/ExpenseForm';

export default function EditExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseForm editId={id} />;
}
