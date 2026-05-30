import { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { PageFrame } from './PageFrame';
import { pickDistractors, type WildPokemon } from '../lib/wildPokemon';

type PokeGuessProps = {
  wild: WildPokemon;
  playerName: string;
  isSavingResult: boolean;
  onFinish: (result: 'caught' | 'fled') => void;
  onBack: () => void;
};

const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

function renderPokemonVisual(image: string, pokemonName: string, className: string) {
  if (/^https?:\/\//i.test(image)) {
    return <img src={image} alt={pokemonName} className={className} />;
  }
  return <div className={className}>{image}</div>;
}

export function PokeGuess({ wild, isSavingResult, onFinish, onBack }: PokeGuessProps) {
  const [stage, setStage] = useState<'appear' | 'playing'>('appear');
  const [selected, setSelected] = useState<WildPokemon | null>(null);

  const choices = useMemo(() => shuffle([wild, ...pickDistractors(wild, 3)]), [wild]);

  return (
    <PageFrame>
      <div className="relative bg-white rounded-3xl shadow-xl px-8 py-4 border-2 border-yellow-400 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="rounded-full" disabled={isSavingResult}>← Back</Button>
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">PokeGuess</h1>
        <div className="w-20" />
      </div>

      <div className="relative bg-white rounded-3xl shadow-xl p-8 border-2 border-blue-400">
        <span className="absolute top-4 left-4 w-2 h-2 rounded-full bg-red-400" />
        <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-blue-500" />

        {stage === 'appear' && (
          <div className="text-center max-w-md mx-auto">
            <div className="mb-4 flex justify-center animate-bounce">
              {renderPokemonVisual(wild.image, wild.pokemon_name, 'h-36 w-36 object-contain')}
            </div>
            <h2 className="text-3xl font-bold mb-2 text-gray-800">A wild Pokémon appeared!</h2>
            <p className="text-gray-600 mb-6">Read the category and clue, then pick the right Pokémon to catch it.</p>
            <Button onClick={() => setStage('playing')} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 py-5 text-lg">
              Show the Clue
            </Button>
          </div>
        )}

        {stage === 'playing' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl p-5 mb-6 text-center">
              <div className="text-xs opacity-90">Category</div>
              <div className="text-xl font-bold mb-3">{wild.category}</div>
              <div className="text-xs opacity-90">Clue</div>
              <div className="text-base italic">"{wild.clue}"</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {choices.map((pokemon) => (
                <button
                  key={pokemon.pokemon_name}
                  onClick={() => !isSavingResult && setSelected(pokemon)}
                  disabled={isSavingResult}
                  className={`bg-gray-50 rounded-2xl shadow hover:shadow-lg transition-all hover:scale-105 flex flex-col items-center justify-center p-5 border-4 ${
                    selected?.pokemon_name === pokemon.pokemon_name
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="h-20 mb-2 flex items-center justify-center">
                    {renderPokemonVisual(pokemon.image, pokemon.pokemon_name, 'h-20 w-20 object-contain text-5xl')}
                  </div>
                  <div className="text-sm font-bold text-gray-800">{pokemon.pokemon_name}</div>
                </button>
              ))}
            </div>

            <div className="text-center">
              <Button
                onClick={() => selected && onFinish(selected.pokemon_name === wild.pokemon_name ? 'caught' : 'fled')}
                disabled={!selected || isSavingResult}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 py-5 text-lg disabled:opacity-50"
              >
                Confirm Guess
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageFrame>
  );
}
