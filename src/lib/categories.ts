import { supabase } from './supabase'
import type { Category } from '../types'

export async function listCategories(householdId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createCategory(
  householdId: string,
  name: string,
  color: string,
  icon: string | null = null,
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ household_id: householdId, name, color, icon })
    .select()
    .single()
  if (error) throw error
  return data
}
