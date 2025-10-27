import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://qgwuszmggenuysrghcdi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd3Vzem1nZ2VudXlzcmdoY2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1Nzk0MzAsImV4cCI6MjA3NzE1NTQzMH0.FAc4B8EdNiCVN3XGoZX90fnbumZFQwKhgxgNCoSxLcA';
const GAME_CODE = 'BELGFR';
const DEFAULT_PLAYERS = [
  { name: 'Eliott', initial_score: 4 },
  { name: 'Timéo', initial_score: 4 },
  { name: 'Lilouan', initial_score: 4 },
];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const playersContainer = document.querySelector('#players');
const historyList = document.querySelector('#history-list');
const historyEmpty = document.querySelector('#history-empty');
const statusEl = document.querySelector('#status');
const undoBtn = document.querySelector('#undo-btn');

let game = null;
let players = [];
let history = [];
let channel = null;
let isLoading = false;

function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.dataset.type = type;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function computeScores() {
  const baseScores = Object.fromEntries(players.map((player) => [player.id, player.initial_score]));
  for (const entry of history) {
    baseScores[entry.player_id] = (baseScores[entry.player_id] ?? 0) + entry.delta;
  }
  return baseScores;
}

function renderPlayers() {
  const scores = computeScores();
  playersContainer.innerHTML = '';

  players.forEach((player) => {
    const card = document.createElement('article');
    card.className = 'player-card';
    card.dataset.playerId = player.id;

    const title = document.createElement('h2');
    title.textContent = player.name;

    const scoreBox = document.createElement('div');
    scoreBox.className = 'score-display';
    const scoreValue = document.createElement('span');
    scoreValue.textContent = scores[player.id] ?? player.initial_score;
    scoreValue.className = 'score-value';
    const label = document.createElement('span');
    label.textContent = 'points';
    scoreBox.append(scoreValue, label);

    const commentGroup = document.createElement('div');
    commentGroup.className = 'comment-group';
    const commentLabel = document.createElement('label');
    const commentId = `comment-${player.id}`;
    commentLabel.setAttribute('for', commentId);
    commentLabel.textContent = 'Commentaire (optionnel)';
    const commentInput = document.createElement('textarea');
    commentInput.id = commentId;
    commentInput.placeholder = 'Explique le point…';
    commentGroup.append(commentLabel, commentInput);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+1';
    addBtn.addEventListener('click', () => handleDelta(player.id, 1, commentInput));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.classList.add('secondary');
    removeBtn.textContent = '−1';
    removeBtn.addEventListener('click', () => handleDelta(player.id, -1, commentInput));

    actions.append(addBtn, removeBtn);

    card.append(title, scoreBox, commentGroup, actions);
    playersContainer.append(card);
  });
}

function renderHistory() {
  historyList.innerHTML = '';
  if (!history.length) {
    historyEmpty.hidden = false;
    undoBtn.disabled = true;
    return;
  }

  historyEmpty.hidden = true;
  undoBtn.disabled = false;

  history
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach((entry) => {
      const listItem = document.createElement('li');
      listItem.className = 'history-item';

      const title = document.createElement('strong');
      const player = players.find((p) => p.id === entry.player_id);
      const delta = entry.delta > 0 ? `+${entry.delta}` : entry.delta;
      title.textContent = `${player?.name ?? 'Joueur'} ${delta}`;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<span>${formatDate(entry.created_at)}</span><span>#${entry.id.slice(0, 8)}</span>`;

      listItem.append(title, meta);

      if (entry.comment) {
        const comment = document.createElement('p');
        comment.textContent = entry.comment;
        listItem.append(comment);
      }

      historyList.append(listItem);
    });
}

async function handleDelta(playerId, delta, commentInput) {
  if (isLoading) return;

  const comment = commentInput.value.trim();
  setStatus('Envoi en cours…');
  isLoading = true;
  togglePlayerButtons(playerId, true);

  const { error } = await supabase.from('points').insert({
    game_id: game.id,
    player_id: playerId,
    delta,
    comment: comment || null,
  });

  if (error) {
    console.error(error);
    setStatus(`Erreur lors de l\'ajout : ${error.message}`, 'error');
  } else {
    commentInput.value = '';
    setStatus('Point enregistré ✅', 'success');
    await refreshData();
  }

  togglePlayerButtons(playerId, false);
  isLoading = false;
}

function togglePlayerButtons(playerId, disabled) {
  const card = playersContainer.querySelector(`[data-player-id="${playerId}"]`);
  if (!card) return;
  for (const button of card.querySelectorAll('button')) {
    button.disabled = disabled;
  }
}

async function handleUndo() {
  if (isLoading || !history.length) return;

  const lastEntry = [...history].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (!lastEntry) return;

  setStatus('Annulation en cours…');
  isLoading = true;
  undoBtn.disabled = true;

  const { error } = await supabase.from('points').delete().eq('id', lastEntry.id);
  if (error) {
    console.error(error);
    setStatus(`Impossible d\'annuler : ${error.message}`, 'error');
  } else {
    setStatus('Dernier coup annulé ✅', 'success');
    await refreshData();
  }

  undoBtn.disabled = false;
  isLoading = false;
}

async function refreshData() {
  const [playersData, historyData] = await Promise.all([
    supabase
      .from('players')
      .select('id, name, initial_score')
      .eq('game_id', game.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('points')
      .select('id, player_id, delta, comment, created_at')
      .eq('game_id', game.id)
      .order('created_at', { ascending: true }),
  ]);

  if (playersData.error) {
    console.error(playersData.error);
    setStatus(`Erreur chargement joueurs : ${playersData.error.message}`, 'error');
    return;
  }
  if (historyData.error) {
    console.error(historyData.error);
    setStatus(`Erreur chargement historique : ${historyData.error.message}`, 'error');
    return;
  }

  players = playersData.data ?? [];
  history = historyData.data ?? [];
  renderPlayers();
  renderHistory();
}

async function ensureGameExists() {
  const { data, error } = await supabase
    .from('games')
    .select('id, name, code')
    .eq('code', GAME_CODE)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return data;
  }

  const { data: created, error: createError } = await supabase
    .from('games')
    .insert({ name: 'Belgique vs France', code: GAME_CODE })
    .select()
    .single();

  if (createError) {
    throw createError;
  }

  return created;
}

async function ensurePlayersExist(gameId) {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, initial_score')
    .eq('game_id', gameId);

  if (error) {
    throw error;
  }

  if (data && data.length >= DEFAULT_PLAYERS.length) {
    const missing = DEFAULT_PLAYERS.filter(
      (defaultPlayer) => !data.some((existing) => existing.name === defaultPlayer.name)
    );
    if (!missing.length) {
      return;
    }

    const inserts = missing.map((player) => ({ ...player, game_id: gameId }));
    const { error: insertError } = await supabase.from('players').insert(inserts);
    if (insertError) {
      throw insertError;
    }
    return;
  }

  const { error: insertError } = await supabase
    .from('players')
    .insert(DEFAULT_PLAYERS.map((player) => ({ ...player, game_id: gameId })));

  if (insertError) {
    throw insertError;
  }
}

function subscribeToRealtime(gameId) {
  if (channel) {
    supabase.removeChannel(channel);
  }

  channel = supabase
    .channel('points-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'points',
        filter: `game_id=eq.${gameId}`,
      },
      async () => {
        await refreshData();
        setStatus('Synchronisé avec Supabase ✅', 'success');
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setStatus('Connecté en temps réel ✅', 'success');
      }
    });
}

async function init() {
  try {
    setStatus('Connexion à Supabase…');
    game = await ensureGameExists();
    setStatus('Partie BELGFR prête ✅', 'success');

    await ensurePlayersExist(game.id);
    await refreshData();
    subscribeToRealtime(game.id);
  } catch (error) {
    console.error(error);
    setStatus(`Erreur initialisation : ${error.message}`, 'error');
  }
}

undoBtn.addEventListener('click', handleUndo);

init();
