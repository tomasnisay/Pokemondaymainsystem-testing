import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 5001);
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in backend .env');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const nativePokemonDexByRegion = {
  Kanto: createDexRange(1, 151),
  Unova: createDexRange(494, 649),
  Paldea: createDexRange(906, 1010),
};

const starterDexIds = new Set([1, 4, 7, 495, 498, 501, 906, 909, 912]);
const regionNames = Object.keys(nativePokemonDexByRegion);

function createDexRange(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizedLower(value) {
  return normalizeText(value).toLowerCase();
}

function exactNameMatch(records, key, rawName) {
  const target = normalizedLower(rawName);
  return (records ?? []).find((record) => normalizedLower(record[key]) === target);
}

function randomFrom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function toTitleCase(value) {
  return String(value ?? '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getDifficulty({ dexId, captureRate, isLegendary, isMythical }) {
  if (starterDexIds.has(dexId)) return 'Easy';
  if (isLegendary || isMythical || captureRate <= 45) return 'Hard';
  if (captureRate <= 120) return 'Medium';
  return 'Easy';
}

function buildClue({ region, type, difficulty }) {
  if (difficulty === 'Hard') return `I am a rare ${type}-type Pokémon from ${region}.`;
  if (difficulty === 'Medium') return `I am a less common ${type}-type Pokémon from ${region}.`;
  return `I am a common ${type}-type Pokémon from ${region}.`;
}

async function fetchPokeApiJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PokeAPI request failed: ${response.status}`);
  }
  return response.json();
}

async function generateWildPokemonFromPokeApi() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const region = randomFrom(regionNames);
    const dexId = randomFrom(nativePokemonDexByRegion[region]);

    const [pokemon, species] = await Promise.all([
      fetchPokeApiJson(`https://pokeapi.co/api/v2/pokemon/${dexId}`),
      fetchPokeApiJson(`https://pokeapi.co/api/v2/pokemon-species/${dexId}`),
    ]);

    const primaryType = pokemon?.types?.[0]?.type?.name;
    const artwork =
      pokemon?.sprites?.other?.['official-artwork']?.front_default ??
      pokemon?.sprites?.other?.home?.front_default ??
      pokemon?.sprites?.front_default;

    if (!primaryType || !artwork) continue;

    const type = toTitleCase(primaryType);
    const difficulty = getDifficulty({
      dexId,
      captureRate: Number(species?.capture_rate ?? 0),
      isLegendary: Boolean(species?.is_legendary),
      isMythical: Boolean(species?.is_mythical),
    });

    return {
      pokemon_name: toTitleCase(pokemon.name),
      type,
      region,
      image: artwork,
      difficulty,
      category: `${type}-type Pokémon`,
      clue: buildClue({ region, type, difficulty }),
    };
  }

  throw new Error('Unable to generate a wild Pokémon right now. Please try again.');
}

async function findPlayerByName(playerName) {
  const normalizedName = normalizeText(playerName);
  if (!normalizedName) {
    throw new Error('Player name is required.');
  }

  const { data, error } = await supabase
    .from('players')
    .select('id, player_name, section, assigned_journey, starter_pokemon_id, created_at')
    .ilike('player_name', normalizedName);

  if (error) {
    throw new Error(`Failed to look up player: ${error.message}`);
  }

  const player = exactNameMatch(data, 'player_name', normalizedName);
  if (!player) {
    return null;
  }

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('coin_balance')
    .eq('player_id', player.id)
    .maybeSingle();

  if (walletError) {
    throw new Error(`Failed to load wallet: ${walletError.message}`);
  }

  return {
    ...player,
    coin_balance: wallet?.coin_balance ?? 0,
  };
}

async function ensurePokemonExistsFromWild(wildPokemon) {
  const pokemonName = normalizeText(wildPokemon?.pokemon_name);
  if (!pokemonName) return null;

  const { data: existingRows, error: existingError } = await supabase
    .from('pokemon')
    .select('id, pokemon_name')
    .ilike('pokemon_name', pokemonName);

  if (existingError) {
    throw new Error(`Failed to find Pokémon: ${existingError.message}`);
  }

  const existing = exactNameMatch(existingRows, 'pokemon_name', pokemonName);
  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from('pokemon')
    .insert({
      pokemon_name: pokemonName,
      type: normalizeText(wildPokemon.type),
      region: normalizeText(wildPokemon.region),
      image: normalizeText(wildPokemon.image),
      evolution_stage: 1,
      evolves_to: null,
      required_stone: null,
    })
    .select('id, pokemon_name')
    .single();

  if (insertError) {
    throw new Error(`Failed to register Pokémon in table: ${insertError.message}`);
  }

  return created;
}

async function findPokemonByName(pokemonName) {
  const normalizedName = normalizeText(pokemonName);
  if (!normalizedName) {
    throw new Error('Pokémon name is required.');
  }

  const { data, error } = await supabase
    .from('pokemon')
    .select('id, pokemon_name')
    .ilike('pokemon_name', normalizedName);

  if (error) {
    throw new Error(`Failed to look up Pokémon: ${error.message}`);
  }

  return exactNameMatch(data, 'pokemon_name', normalizedName) ?? null;
}

async function ensurePlayerPokemonRecord({ playerId, pokemonId, gameName }) {
  const { data: existing, error: existingError } = await supabase
    .from('player_pokemon')
    .select('id')
    .eq('player_id', playerId)
    .eq('pokemon_id', pokemonId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check player Pokédex: ${existingError.message}`);
  }

  if (existing) {
    return;
  }

  const { error: insertError } = await supabase
    .from('player_pokemon')
    .insert({
      player_id: playerId,
      pokemon_id: pokemonId,
      level: 1,
      source: gameName,
      status: 'Active',
    });

  if (insertError) {
    throw new Error(`Failed to add Pokémon to player Pokédex: ${insertError.message}`);
  }
}

async function applyCoinReward({ playerId, coinsEarned }) {
  if (!coinsEarned || coinsEarned <= 0) return;

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('id, coin_balance')
    .eq('player_id', playerId)
    .maybeSingle();

  if (walletError) {
    throw new Error(`Failed to load wallet: ${walletError.message}`);
  }

  if (!wallet) {
    const { error: createWalletError } = await supabase
      .from('wallets')
      .insert({ player_id: playerId, coin_balance: coinsEarned });
    if (createWalletError) {
      throw new Error(`Failed to create wallet: ${createWalletError.message}`);
    }
    return;
  }

  const nextBalance = Number(wallet.coin_balance ?? 0) + coinsEarned;
  const { error: updateWalletError } = await supabase
    .from('wallets')
    .update({ coin_balance: nextBalance })
    .eq('id', wallet.id);

  if (updateWalletError) {
    throw new Error(`Failed to update wallet: ${updateWalletError.message}`);
  }
}

async function writeGameLog({
  playerId,
  pokemonId,
  gameName,
  result,
  levelGain,
  coinsEarned,
  sourceSystem,
}) {
  const { error } = await supabase.from('game_logs').insert({
    player_id: playerId,
    pokemon_id: pokemonId,
    game_name: gameName,
    result,
    level_gain: levelGain,
    coins_earned: coinsEarned,
    source_system: sourceSystem,
    logged_by: 'catching-subsystem-api',
  });

  if (error) {
    throw new Error(`Failed to save game log: ${error.message}`);
  }
}

function validateCatchPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload.');
  }

  const playerName = normalizeText(payload.playerName);
  const pokemonName = normalizeText(payload.pokemonName);
  const gameName = normalizeText(payload.gameName);
  const result = normalizeText(payload.result).toLowerCase();
  const sourceSystem = normalizeText(payload.sourceSystem);
  const levelGain = Number(payload.levelGain ?? 0);
  const requestedCoinsEarned = Number(payload.coinsEarned ?? 0);

  if (!playerName) throw new Error('playerName is required.');
  if (!pokemonName) throw new Error('pokemonName is required.');
  if (!gameName) throw new Error('gameName is required.');
  if (!['caught', 'fled'].includes(result)) throw new Error('result must be either "caught" or "fled".');
  if (sourceSystem !== 'catching_subsystem') throw new Error('sourceSystem must be "catching_subsystem".');
  if (Number.isNaN(levelGain) || levelGain < 0) throw new Error('levelGain must be a non-negative number.');
  if (Number.isNaN(requestedCoinsEarned) || requestedCoinsEarned < 0) {
    throw new Error('coinsEarned must be a non-negative number.');
  }

  const enforcedCoinsEarned = result === 'caught' ? 20 : 0;
  const enforcedLevelGain = 0;

  return {
    playerName,
    pokemonName,
    gameName,
    result,
    levelGain: enforcedLevelGain,
    coinsEarned: enforcedCoinsEarned,
    sourceSystem,
    wildPokemon: payload.wildPokemon ?? null,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'catching-subsystem-backend' });
});

app.get('/api/player/lookup', async (req, res) => {
  try {
    const normalizedName = normalizeText(req.query.name);
    if (!normalizedName) {
      return res.status(400).json({ message: 'Player name is required.' });
    }

    const player = await findPlayerByName(normalizedName);
    if (!player) {
      return res.status(404).json({
        message: 'Player not found. Please retry with your registered name.',
      });
    }

    return res.status(200).json({ player });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return res.status(500).json({ message });
  }
});

app.get('/api/wild-pokemon', async (_req, res) => {
  try {
    const wildPokemon = await generateWildPokemonFromPokeApi();
    await ensurePokemonExistsFromWild(wildPokemon);
    return res.status(200).json({ wildPokemon });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return res.status(500).json({ message });
  }
});

app.post('/api/results/catch', async (req, res) => {
  try {
    const payload = validateCatchPayload(req.body);

    const player = await findPlayerByName(payload.playerName);
    if (!player) {
      return res.status(404).json({ message: 'Player not found. Please retry with your registered name.' });
    }

    let pokemon = await findPokemonByName(payload.pokemonName);
    if (!pokemon && payload.wildPokemon) {
      pokemon = await ensurePokemonExistsFromWild(payload.wildPokemon);
    }

    if (!pokemon) {
      return res.status(404).json({
        message: `Pokémon "${payload.pokemonName}" was not found in the pokemon table.`,
      });
    }

    if (payload.result === 'caught') {
      await ensurePlayerPokemonRecord({
        playerId: player.id,
        pokemonId: pokemon.id,
        gameName: payload.gameName,
      });
    }

    await applyCoinReward({
      playerId: player.id,
      coinsEarned: payload.coinsEarned,
    });

    await writeGameLog({
      playerId: player.id,
      pokemonId: pokemon.id,
      gameName: payload.gameName,
      result: payload.result,
      levelGain: payload.levelGain,
      coinsEarned: payload.coinsEarned,
      sourceSystem: payload.sourceSystem,
    });

    return res.status(200).json({
      success: true,
      message: 'Result saved successfully.',
      playerId: player.id,
      pokemonId: pokemon.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    return res.status(500).json({ success: false, message });
  }
});

app.listen(port, () => {
  console.log(`[catching-backend] listening on http://127.0.0.1:${port}`);
});
