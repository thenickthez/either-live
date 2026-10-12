let selectedSetId = null;
let selectedSetName = '';

const setsEl = document.getElementById('sets');
const editorEl = document.getElementById('editor');
const questionsEl = document.getElementById('questions');
const setTitleEl = document.getElementById('set-title');
const messageEl = document.getElementById('admin-message');

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
}

function message(text) {
    messageEl.textContent = text;
    setTimeout(() => { messageEl.textContent = ''; }, 3500);
}

async function loadSets() {
    const sets = await api('/api/sets');
    setsEl.innerHTML = '';

    sets.forEach(set => {
        const row = document.createElement('div');
        row.className = 'set-row';
        row.innerHTML = `
            <button class="set-select" type="button">
                <strong>${escapeHtml(set.name)}</strong>
                <span>${set.question_count} question${set.question_count === 1 ? '' : 's'}</span>
            </button>
            <button class="small-button rename" type="button">Rename</button>
            <button class="small-button danger delete" type="button">Delete</button>
        `;
        row.querySelector('.set-select').onclick = () => selectSet(set.id, set.name);
        row.querySelector('.rename').onclick = () => renameSet(set.id, set.name);
        row.querySelector('.delete').onclick = () => deleteSet(set.id, set.name);
        setsEl.appendChild(row);
    });
}

async function selectSet(id, name) {
    selectedSetId = id;
    selectedSetName = name;
    setTitleEl.textContent = name;
    editorEl.classList.remove('hidden');
    await loadQuestions();
}

async function loadQuestions() {
    const questions = await api(`/api/sets/${selectedSetId}/questions`);
    questionsEl.innerHTML = '';

    if (!questions.length) {
        questionsEl.innerHTML = '<p class="empty-state">No questions yet. Add your first one above.</p>';
        return;
    }

    questions.forEach((question, index) => {
        const row = document.createElement('div');
        row.className = 'question-row';
        row.innerHTML = `
            <div class="question-number">${index + 1}</div>
            <div class="question-copy">
                <strong>${escapeHtml(question.option_a)}</strong>
                <span>OR</span>
                <strong>${escapeHtml(question.option_b)}</strong>
            </div>
            <button class="small-button edit" type="button">Edit</button>
            <button class="small-button danger delete" type="button">Delete</button>
        `;
        row.querySelector('.edit').onclick = () => editQuestion(question);
        row.querySelector('.delete').onclick = () => deleteQuestion(question.id);
        questionsEl.appendChild(row);
    });
}

async function renameSet(id, currentName) {
    const name = prompt('Question set name:', currentName);
    if (!name || name.trim() === currentName) return;
    await api(`/api/sets/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    if (selectedSetId === id) {
        selectedSetName = name.trim();
        setTitleEl.textContent = selectedSetName;
    }
    await loadSets();
}

async function deleteSet(id, name) {
    if (!confirm(`Delete "${name}" and all of its questions?`)) return;
    try {
        await api(`/api/sets/${id}`, { method: 'DELETE' });
        if (selectedSetId === id) {
            selectedSetId = null;
            editorEl.classList.add('hidden');
        }
        await loadSets();
    } catch (error) {
        message(error.message);
    }
}

async function editQuestion(question) {
    const optionA = prompt('Option A:', question.option_a);
    if (optionA === null) return;
    const optionB = prompt('Option B:', question.option_b);
    if (optionB === null) return;
    await api(`/api/questions/${question.id}`, {
        method: 'PUT',
        body: JSON.stringify({ option_a: optionA, option_b: optionB })
    });
    await loadQuestions();
}

async function deleteQuestion(id) {
    if (!confirm('Delete this question?')) return;
    await api(`/api/questions/${id}`, { method: 'DELETE' });
    await loadQuestions();
    await loadSets();
}

document.getElementById('new-set-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('new-set-name');
    const set = await api('/api/sets', { method: 'POST', body: JSON.stringify({ name: input.value }) });
    input.value = '';
    await loadSets();
    await selectSet(set.id, set.name);
});

document.getElementById('new-question-form').addEventListener('submit', async event => {
    event.preventDefault();
    const optionA = document.getElementById('option-a');
    const optionB = document.getElementById('option-b');
    await api(`/api/sets/${selectedSetId}/questions`, {
        method: 'POST',
        body: JSON.stringify({ option_a: optionA.value, option_b: optionB.value })
    });
    optionA.value = '';
    optionB.value = '';
    optionA.focus();
    await loadQuestions();
    await loadSets();
});

document.getElementById('launch-game').addEventListener('click', async () => {
    try {
        const game = await api('/api/games', { method: 'POST', body: JSON.stringify({ set_id: selectedSetId }) });
        window.location.href = game.host_url;
    } catch (error) {
        message(error.message);
    }
});

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

loadSets().catch(error => message(error.message));
