// client/src/widgets/registry.jsx
// Client mirror of the server catalog: type → component. Adding a widget = add
// one file + one line here.
import { WeatherCard } from './widgets/WeatherCard.jsx';
import { SuggestionCard } from './widgets/SuggestionCard.jsx';
import { GoldenSpoon } from './widgets/GoldenSpoon.jsx';

export const WIDGET_REGISTRY = {
  weather: WeatherCard,
  suggestion: SuggestionCard,
  golden_spoon: GoldenSpoon,
};
