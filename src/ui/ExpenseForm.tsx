import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Alert } from './dialog';
import type { PaymentMethod } from '../domain/core';
import { today } from '../domain/dates';
import { createExpense, deleteExpense, getExpense, listExpenseCategories, updateExpense, createExpenseCategory } from '../domain/expenses';
import { formatMoney, moneyToInput, parseMoney } from '../domain/money';
import { useApp, useData, useRequestId } from '../state/app';
import { space } from '../theme';
import { PAYMENT_METHOD_LABEL } from './business';
import { DateField, Field, ImageField, MoneyField } from './forms';
import { Button, Chips, Loading, Notice, Row, SectionTitle } from './primitives';
import { Screen } from './Screen';

export function ExpenseForm({ editId }: { editId?: string }) {
  const { mutate, db } = useApp();
  const requestId = useRequestId();
  const { data: cats } = useData((db) => listExpenseCategories(db));
  const [loaded, setLoaded] = useState(!editId);
  const [linked, setLinked] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [description, setDescription] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editId) return;
    getExpense(db, editId).then((e) => {
      if (e) {
        setTitle(e.title);
        setCategoryId(e.category_id);
        setAmount(moneyToInput(e.amount));
        setDate(e.expense_date);
        setMethod(e.payment_method);
        setDescription(e.description ?? '');
        setReceipt(e.receipt_path);
        setLinked(e.purchase_batch_id);
      }
      setLoaded(true);
    });
  }, [db, editId]);

  if (!loaded || !cats) return <Screen title="Expense" back><Loading /></Screen>;
  const value = parseMoney(amount);
  const valid = !!title.trim() && !!categoryId && value != null && value > 0;

  const save = async () => {
    setSaving(true);
    const input = { categoryId: categoryId!, title, amount: value!, expenseDate: date, paymentMethod: method, description, receiptPath: receipt };
    const res = editId
      ? await mutate((db) => updateExpense(db, editId, input), { success: 'Expense updated' })
      : await mutate((db) => createExpense(db, { ...input, requestId }), { success: 'Expense recorded' });
    setSaving(false);
    if (res !== undefined) router.back();
  };

  const remove = () =>
    Alert.alert('Delete this expense?', `${title} · ${formatMoney(value ?? 0)}. Your profit figures will be recalculated. A record stays in the business history.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if ((await mutate((db) => deleteExpense(db, editId!), { success: 'Expense deleted' })) !== undefined) router.back();
        },
      },
    ]);

  const addCategory = async () => {
    const id = await mutate((db) => createExpenseCategory(db, newCat), { success: 'Category added' });
    if (id) {
      setCategoryId(id);
      setNewCat('');
    }
  };

  if (linked) {
    return (
      <Screen title={title} back>
        <Notice message="This expense was created automatically from a purchase's additional costs. Edit the purchase to change it." />
        <Button title="Open the purchase" icon="cube-outline" onPress={() => router.replace({ pathname: '/purchase/[id]', params: { id: linked } })} />
      </Screen>
    );
  }

  return (
    <Screen
      title={editId ? 'Edit expense' : 'New expense'}
      back
      footer={
        <Row gap={space.sm}>
          {editId ? <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} style={{ flex: 1 }} /> : null}
          <Button title={editId ? 'Save changes' : 'Save expense'} icon="checkmark" onPress={save} loading={saving} disabled={!valid} style={{ flex: 2 }} />
        </Row>
      }
    >
      <MoneyField label="Amount" value={amount} onChangeText={setAmount} />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Instagram campaign" autoCapitalize="sentences" />
      <SectionTitle title="Category" />
      <Chips options={cats.map((c) => ({ value: c.id, label: c.name }))} value={categoryId} onChange={setCategoryId} />
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Field placeholder="New category name" value={newCat} onChangeText={setNewCat} />
        </View>
        <Button title="Add" small full={false} variant="secondary" disabled={!newCat.trim()} onPress={addCategory} style={{ minHeight: 50 }} />
      </View>
      <SectionTitle title="Details" />
      <DateField label="Date" value={date} onChange={setDate} />
      <Chips options={(['cash', 'bank_transfer', 'other'] as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} value={method} onChange={setMethod} />
      <View style={{ height: space.lg }} />
      <Field label="Description" optional value={description} onChangeText={setDescription} multiline />
      <ImageField label="Receipt" value={receipt} onChange={setReceipt} square={false} />
    </Screen>
  );
}
