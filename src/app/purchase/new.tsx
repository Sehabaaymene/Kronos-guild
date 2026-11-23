import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { PurchaseForm } from '../../ui/PurchaseForm';

export default function NewPurchase() {
  const { brand, model } = useLocalSearchParams<{ brand?: string; model?: string }>();
  return <PurchaseForm initialBrand={brand} initialModel={model} />;
}
