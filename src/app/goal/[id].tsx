import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { GoalForm } from '../../ui/GoalForm';

export default function EditGoal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GoalForm editId={id} />;
}
