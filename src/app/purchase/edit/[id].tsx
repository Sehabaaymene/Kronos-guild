import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { PurchaseForm } from '../../../ui/PurchaseForm';

export default function EditPurchase() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PurchaseForm editId={id} />;
}
