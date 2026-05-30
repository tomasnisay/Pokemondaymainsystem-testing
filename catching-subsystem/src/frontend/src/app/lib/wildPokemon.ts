export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type WildPokemon = {
  pokemon_name: string;
  type: string;
  region: 'Kanto' | 'Unova' | 'Paldea';
  image: string;
  difficulty: Difficulty;
  clue: string;
  category: string;
};

const fallbackDistractorPool: WildPokemon[] = [
  { pokemon_name: 'Bulbasaur', type: 'Grass', region: 'Kanto', image: '🌱', difficulty: 'Easy', category: 'Grass-type Pokémon', clue: 'I am a Kanto Pokémon.' },
  { pokemon_name: 'Squirtle', type: 'Water', region: 'Kanto', image: '🐢', difficulty: 'Easy', category: 'Water-type Pokémon', clue: 'I am a Kanto Pokémon.' },
  { pokemon_name: 'Pikachu', type: 'Electric', region: 'Kanto', image: '⚡', difficulty: 'Easy', category: 'Electric-type Pokémon', clue: 'I am a Kanto Pokémon.' },
  { pokemon_name: 'Snivy', type: 'Grass', region: 'Unova', image: '🐍', difficulty: 'Easy', category: 'Grass-type Pokémon', clue: 'I am an Unova Pokémon.' },
  { pokemon_name: 'Zorua', type: 'Dark', region: 'Unova', image: '🦊', difficulty: 'Medium', category: 'Dark-type Pokémon', clue: 'I am an Unova Pokémon.' },
  { pokemon_name: 'Axew', type: 'Dragon', region: 'Unova', image: '🐲', difficulty: 'Hard', category: 'Dragon-type Pokémon', clue: 'I am an Unova Pokémon.' },
  { pokemon_name: 'Sprigatito', type: 'Grass', region: 'Paldea', image: '🐈', difficulty: 'Easy', category: 'Grass-type Pokémon', clue: 'I am a Paldea Pokémon.' },
  { pokemon_name: 'Quaxly', type: 'Water', region: 'Paldea', image: '🦆', difficulty: 'Easy', category: 'Water-type Pokémon', clue: 'I am a Paldea Pokémon.' },
  { pokemon_name: 'Lechonk', type: 'Normal', region: 'Paldea', image: '🐖', difficulty: 'Medium', category: 'Normal-type Pokémon', clue: 'I am a Paldea Pokémon.' },
];

export async function generateWildPokemon(): Promise<WildPokemon> {
  const apiBase = (import.meta.env.VITE_BACKEND_URL ?? '').trim().replace(/\/$/, '');
  const requestUrl = `${apiBase}/api/wild-pokemon`;
  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  let body: { message?: string; wildPokemon?: WildPokemon } | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(body?.message ?? 'Unable to generate a wild Pokémon right now.');
  }

  if (!body?.wildPokemon) {
    throw new Error('Wild Pokémon generation succeeded but no data was returned.');
  }

  return body.wildPokemon;
}

export function pickDistractors(wild: WildPokemon, count: number): WildPokemon[] {
  const localPool = fallbackDistractorPool.filter(
    (pokemon) => pokemon.pokemon_name !== wild.pokemon_name && pokemon.region === wild.region,
  );
  const shuffled = [...localPool].sort(() => Math.random() - 0.5);
  if (shuffled.length >= count) {
    return shuffled.slice(0, count);
  }
  const remaining = fallbackDistractorPool
    .filter((pokemon) => pokemon.pokemon_name !== wild.pokemon_name && !shuffled.includes(pokemon))
    .slice(0, count - shuffled.length);
  return [...shuffled, ...remaining];
}
