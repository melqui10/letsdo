import { supabase } from './supabase'
import type { Household, Profile } from '../types'

// Garante que existe uma linha em `profiles` para o usuário logado.
export async function ensureProfile(
  userId: string,
  email?: string | null,
): Promise<void> {
  const displayName = email ? email.split('@')[0] : ''
  const { error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, display_name: displayName },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  if (error) throw error
}

// Perfil do usuário logado (para exibir/editar o nome).
export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}

// Atualiza o nome de exibição do usuário.
export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
  if (error) throw error
}

// Households a que o usuário pertence (a RLS já filtra pelos seus).
export async function getMyHouseholds(): Promise<Household[]> {
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Cria um novo lar e adiciona o usuário como dono (função atômica no banco).
export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await supabase.rpc('create_household', {
    household_name: name,
  })
  if (error) throw error
  return data as Household
}

// Entra em um lar existente pelo código (id do household).
export async function joinHousehold(
  householdId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('household_members')
    .insert({ household_id: householdId, profile_id: userId, role: 'member' })
  if (error) throw error
}

// Perfis dos membros de um lar (para exibir responsáveis).
export async function getHouseholdMembers(
  householdId: string,
): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('profiles(*)')
    .eq('household_id', householdId)
  if (error) throw error
  return ((data ?? []) as unknown as { profiles: Profile | null }[])
    .map((row) => row.profiles)
    .filter((p): p is Profile => Boolean(p))
}
