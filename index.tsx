
import { inject } from '@vercel/analytics'; // <-- 添加这一行
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
inject(); // <-- 添加这一行
//
// Ensure API_KEY is handled by the execution environment.
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    console.error("API_KEY is not set. Please ensure the API_KEY environment variable is configured.");
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = '配置错误：API密钥未找到。请联系支持。';
        errorDiv.classList.remove('hidden');
    }
    const learnButtonElement = document.getElementById('learn-button') as HTMLButtonElement | null;
    if (learnButtonElement) learnButtonElement.disabled = true;
    const wordInputElement = document.getElementById('word-input') as HTMLInputElement | null;
    if (wordInputElement) wordInputElement.disabled = true;
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// DOM Elements - Main View
const wordInput = document.getElementById('word-input') as HTMLInputElement;
const learnButton = document.getElementById('learn-button') as HTMLButtonElement;
const loadingSpinner = document.getElementById('loading-spinner');
const errorMessageDiv = document.getElementById('error-message');
const wordAnalysisContainer = document.getElementById('word-analysis-container');
const centralWordH2 = document.getElementById('central-word');
const initialMessageDiv = document.getElementById('initial-message');
const mainContentArea = document.getElementById('main-content-area');

const q1Content = document.querySelector('#quadrant1 .quadrant-content') as HTMLElement;
const q2Content = document.querySelector('#quadrant2 .quadrant-content') as HTMLElement;
const q3Content = document.querySelector('#quadrant3 .quadrant-content') as HTMLElement;
const q4Content = document.querySelector('#quadrant4 .quadrant-content') as HTMLElement;

// Vocabulary Book DOM Elements
const vocabularyListUl = document.getElementById('vocabulary-list') as HTMLUListElement;
const emptyVocabularyMessageP = document.getElementById('empty-vocabulary-message');
const toggleFilterVocabButton = document.getElementById('toggle-filter-vocab-button') as HTMLButtonElement;


// Root Book DOM Elements
const rootListUl = document.getElementById('root-list') as HTMLUListElement;
const emptyRootBookMessageP = document.getElementById('empty-root-book-message');
const toggleFilterRootsButton = document.getElementById('toggle-filter-roots-button') as HTMLButtonElement;

// Affix Book DOM Elements (for prefixes and suffixes)
const affixListUl = document.getElementById('affix-list') as HTMLUListElement;
const emptyAffixBookMessageP = document.getElementById('empty-affix-book-message');
const toggleFilterAffixesButton = document.getElementById('toggle-filter-affixes-button') as HTMLButtonElement;

// Item Detail View DOM Elements (replaces Affix Detail View)
const itemDetailViewDiv = document.getElementById('item-detail-view') as HTMLDivElement;
const itemDetailContentDiv = document.getElementById('item-detail-content') as HTMLDivElement;
const itemDetailTitleH2 = document.getElementById('item-detail-title') as HTMLHeadingElement;
const itemDetailDefinitionDiv = document.getElementById('item-detail-definition') as HTMLDivElement;
const itemDetailRelatedWordsUl = document.getElementById('item-detail-related-words-list') as HTMLUListElement;
const backToMainViewButton = document.getElementById('back-to-main-view-button') as HTMLButtonElement;


// --- Interfaces ---
interface BilingualString {
    en: string;
    zh: string;
}

interface ContextExample {
    sentence: BilingualString;
    youglishSearchUrl?: string;
}
interface EtymologyPart {
    name: string;
    meaning: string;
    origin?: string;
    details?: string;
    examples?: string[];
}
interface DetailedEtymology {
    main?: string;
    root?: EtymologyPart;
    prefix?: EtymologyPart;
    suffix?: EtymologyPart;
    literalLogic?: string;
}
interface WordAnalysisData {
    word: string;
    quadrant1: {
        overallCoreConcept?: string;
        senses: Array<{
            senseTitle: string;
            coreFeeling: string;
            contexts: ContextExample[];
        }>;
        synonymsAntonyms: {
            [key: string]: BilingualString[];
        };
        etymology: DetailedEtymology;
    };
    quadrant2: {
        pronunciation: {
            ipa: string;
            tip: string;
        };
        collocations: BilingualString[];
    };
    quadrant3: {
        spellingBreakdown: string;
        aiMnemonics?: string;
        derivatives: Array<{
            word: string;
            pos: string;
            meaning: BilingualString;
            example?: BilingualString;
        }>;
        confusingRelatedWords: {
            main?: string;
            comparisons: Array<{
                word: string;
                description: BilingualString;
                example?: BilingualString;
            }>;
        };
    };
    quadrant4: {
        summary: string;
    };
}

interface VocabularyEntry {
    word: string;
    marked: boolean;
    addedTimestamp: number;
    analysisData?: WordAnalysisData;
}

interface MorphologicalPartDetail extends EtymologyPart {
    type: 'root' | 'prefix' | 'suffix';
    marked: boolean; // Added for marking roots/affixes
}

interface MorphologicalBookEntry {
    part: MorphologicalPartDetail;
    associatedWords: string[];
}

// --- State Variables ---
let vocabularyList: VocabularyEntry[] = [];
const VOCABULARY_STORAGE_KEY = 'fourQuadrantVocabulary_v5'; // v5 for marked morphological parts

let rootBook: MorphologicalBookEntry[] = [];
const ROOT_BOOK_STORAGE_KEY = 'fourQuadrantRootBook_v2';

let affixBook: MorphologicalBookEntry[] = [];
const AFFIX_BOOK_STORAGE_KEY = 'fourQuadrantAffixBook_v2';

let showOnlyMarkedVocab = false;
let showOnlyMarkedRoots = false;
let showOnlyMarkedAffixes = false;

// --- UI Helper Functions ---
function showLoading(isLoading: boolean) {
    loadingSpinner?.classList.toggle('hidden', !isLoading);
    if (learnButton) learnButton.disabled = isLoading;
    if (isLoading) {
        errorMessageDiv?.classList.add('hidden');
        wordAnalysisContainer?.classList.add('hidden');
        initialMessageDiv?.classList.add('hidden');
    }
}

function showError(message: string) {
    if (errorMessageDiv) {
        errorMessageDiv.textContent = message;
        errorMessageDiv.classList.remove('hidden');
    }
    wordAnalysisContainer?.classList.add('hidden');
    if (API_KEY && initialMessageDiv && vocabularyList.length === 0 && wordAnalysisContainer?.classList.contains('hidden')) {
        initialMessageDiv.classList.remove('hidden');
    }
}

function clearPreviousData(clearCentralWord: boolean = true) {
    if (clearCentralWord && centralWordH2) centralWordH2.textContent = '';
    if (q1Content) q1Content.innerHTML = '';
    if (q2Content) q2Content.innerHTML = '';
    if (q3Content) q3Content.innerHTML = '';
    if (q4Content) q4Content.innerHTML = '';
    errorMessageDiv?.classList.add('hidden');
}

function createParagraph(text: string, className?: string, allowHTML: boolean = false): HTMLParagraphElement {
    const p = document.createElement('p');
    if (allowHTML) {
        p.innerHTML = text;
    } else {
        p.textContent = text;
    }
    if (className) {
        p.className = className;
    }
    return p;
}

function createBilingualParagraph(bilingualText: BilingualString, className?: string): HTMLParagraphElement {
    const p = document.createElement('p');
    if (className) p.className = className;
    p.classList.add('bilingual-text');

    const enSpan = document.createElement('span');
    enSpan.className = 'en-text';
    enSpan.textContent = bilingualText.en;
    p.appendChild(enSpan);

    if (bilingualText.zh) {
        const zhSpan = document.createElement('span');
        zhSpan.className = 'zh-text';
        zhSpan.textContent = ` (${bilingualText.zh})`;
        p.appendChild(zhSpan);
    }
    return p;
}


function createList(items: string[] | BilingualString[] | undefined, itemType: 'string' | 'bilingual' = 'string', itemShouldAllowHTML: boolean = false): HTMLUListElement | null {
    if (!items || items.length === 0) return null;
    const ul = document.createElement('ul');
    items.forEach(item => {
        const li = document.createElement('li');
        if (itemType === 'bilingual' && typeof item === 'object' && 'en' in item && 'zh' in item) {
            li.appendChild(createBilingualParagraph(item as BilingualString));
        } else if (typeof item === 'string') {
            if (itemShouldAllowHTML) {
                li.innerHTML = item;
            } else {
                li.textContent = item;
            }
        }
        ul.appendChild(li);
    });
    return ul;
}

// --- Rendering Functions for Quadrants ---
function renderQuadrant1(data: WordAnalysisData['quadrant1']) {
    if (!q1Content || !data) return;
    q1Content.innerHTML = '';

    if (data.overallCoreConcept) {
        q1Content.appendChild(createParagraph(`<strong>总体核心概念:</strong> ${data.overallCoreConcept}`, undefined, true));
    }

    if (data.senses && Array.isArray(data.senses)) {
        data.senses.forEach((sense) => {
            const senseDiv = document.createElement('div');
            senseDiv.className = 'q1-sense-block';
            if (sense.senseTitle) {
                const h4 = document.createElement('h4');
                h4.innerHTML = sense.senseTitle;
                senseDiv.appendChild(h4);
            }
            if (sense.coreFeeling) {
                senseDiv.appendChild(createParagraph(sense.coreFeeling));
            }
            if (sense.contexts && Array.isArray(sense.contexts) && sense.contexts.length > 0) {
                senseDiv.appendChild(createParagraph('<strong>语境示例:</strong>', undefined, true));
                const contextsDiv = document.createElement('div');
                sense.contexts.forEach(context => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'context-example-item';
                    
                    const bilingualP = createBilingualParagraph(context.sentence, 'sentence-text');
                    itemDiv.appendChild(bilingualP);

                    if (context.youglishSearchUrl) {
                        const speakerLink = document.createElement('a');
                        speakerLink.href = context.youglishSearchUrl;
                        speakerLink.target = '_blank';
                        speakerLink.rel = 'noopener noreferrer';
                        speakerLink.className = 'speaker-icon';
                        speakerLink.innerHTML = '🔊';
                        speakerLink.setAttribute('aria-label', `在Youglish上查找 "${context.sentence.en}" 的发音`);
                        itemDiv.appendChild(speakerLink);
                    }
                    contextsDiv.appendChild(itemDiv);
                });
                senseDiv.appendChild(contextsDiv);
            }
            q1Content.appendChild(senseDiv);
        });
    }

    // Render Etymology first
    if (data.etymology) {
        const h4 = document.createElement('h4');
        h4.textContent = '词源';
        q1Content.appendChild(h4);
        const etymologyDiv = document.createElement('div');
        etymologyDiv.className = 'etymology-item';
        if (data.etymology.main) etymologyDiv.appendChild(createParagraph(data.etymology.main));

        const renderPart = (part: EtymologyPart | undefined, typeName: string) => {
            if (part && part.name) {
                let partHtml = `<strong>${part.name} (${typeName}):</strong> 含义：'${part.meaning}'`;
                if(part.origin) partHtml += `。来源：${part.origin}`;
                if(part.details) partHtml += `。${part.details}`;
                etymologyDiv.appendChild(createParagraph(partHtml, undefined, true));
                if (part.examples && part.examples.length > 0) {
                    const exampleIntro = document.createElement('span');
                    exampleIntro.className = 'etymology-example-intro';
                    exampleIntro.textContent = '例如: ';
                    const p = createParagraph('');
                    p.appendChild(exampleIntro);
                    p.appendChild(document.createTextNode(part.examples.join('， ')));
                    etymologyDiv.appendChild(p);
                }
            }
        };
        renderPart(data.etymology.prefix, '前缀');
        renderPart(data.etymology.root, '词根');
        renderPart(data.etymology.suffix, '后缀');
        
        if (data.etymology.literalLogic) {
            etymologyDiv.appendChild(createParagraph(`<strong>字面逻辑:</strong> ${data.etymology.literalLogic}`, undefined, true));
        }
        q1Content.appendChild(etymologyDiv);
    }
    
    // Then render Synonyms and Antonyms
    if (data.synonymsAntonyms && Object.keys(data.synonymsAntonyms).length > 0) {
        const h4 = document.createElement('h4');
        h4.textContent = '近义词与反义词';
        q1Content.appendChild(h4);
        Object.keys(data.synonymsAntonyms).forEach(key => {
            const items = data.synonymsAntonyms[key];
            if (items && Array.isArray(items) && items.length > 0) {
                let translatedKey = key.replace(/_/g, ' ');
                if (translatedKey.includes('synonyms')) translatedKey = translatedKey.replace('synonyms', '近义词');
                if (translatedKey.includes('antonyms')) translatedKey = translatedKey.replace('antonyms', '反义词');
                
                const sectionP = createParagraph(`<strong>${translatedKey.trim()}:</strong>`, undefined, true);
                q1Content.appendChild(sectionP);
                const list = createList(items, 'bilingual');
                if (list) q1Content.appendChild(list);
            }
        });
    }
}

function renderQuadrant2(data: WordAnalysisData['quadrant2']) {
    if (!q2Content || !data) return;
    q2Content.innerHTML = '';

    if (data.pronunciation) {
        const h4 = document.createElement('h4');
        h4.textContent = '发音';
        q2Content.appendChild(h4);
        let pronHtml = '';
        if (data.pronunciation.ipa) pronHtml += `<strong>IPA:</strong> ${data.pronunciation.ipa}<br>`;
        if (data.pronunciation.tip) pronHtml += `${data.pronunciation.tip}`;
        q2Content.appendChild(createParagraph(pronHtml, undefined, true));
    }

    if (data.collocations && data.collocations.length > 0) {
        const h4 = document.createElement('h4');
        h4.textContent = '固定搭配';
        q2Content.appendChild(h4);
        const list = createList(data.collocations, 'bilingual');
        if (list) q2Content.appendChild(list);
    }
}

function renderQuadrant3(data: WordAnalysisData['quadrant3']) {
    if (!q3Content || !data) return;
    q3Content.innerHTML = '';

    if (data.spellingBreakdown) {
        const h4 = document.createElement('h4');
        h4.textContent = '拼写分解';
        q3Content.appendChild(h4);
        q3Content.appendChild(createParagraph(data.spellingBreakdown));
    }
     if (data.aiMnemonics) {
        const h4 = document.createElement('h4');
        h4.textContent = 'AI助记';
        q3Content.appendChild(h4);
        q3Content.appendChild(createParagraph(data.aiMnemonics, undefined, true));
    }

    if (data.derivatives && data.derivatives.length > 0) {
        const h4 = document.createElement('h4');
        h4.textContent = '派生词';
        q3Content.appendChild(h4);
        data.derivatives.forEach((item) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'derivative-item';
            const titleP = createParagraph(`<strong>${item.word} (${item.pos}):</strong> `, undefined, true);
            const meaningP = createBilingualParagraph(item.meaning);
            titleP.appendChild(meaningP.childNodes[0]); // en
            if (meaningP.childNodes[1]) titleP.appendChild(meaningP.childNodes[1]); // zh
            itemDiv.appendChild(titleP);

            if (item.example) {
                const exampleTitle = createParagraph(`<span class="etymology-example-intro">例如:</span> `, undefined, true)
                const exampleP = createBilingualParagraph(item.example);
                exampleTitle.appendChild(exampleP.childNodes[0]);
                if (exampleP.childNodes[1]) exampleTitle.appendChild(exampleP.childNodes[1]);
                itemDiv.appendChild(exampleTitle);
            }
            q3Content.appendChild(itemDiv);
        });
    }

    if (data.confusingRelatedWords) {
        const h4 = document.createElement('h4');
        h4.textContent = '易混/相关词';
        q3Content.appendChild(h4);
        if(data.confusingRelatedWords.main) {
             q3Content.appendChild(createParagraph(`<strong>${data.confusingRelatedWords.main}</strong>`, undefined, true));
        }
        if (data.confusingRelatedWords.comparisons && data.confusingRelatedWords.comparisons.length > 0) {
            data.confusingRelatedWords.comparisons.forEach((item) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'confusing-word-item';
                const titleP = createParagraph(`<strong>${item.word}:</strong> `, undefined, true);
                const descriptionP = createBilingualParagraph(item.description);
                titleP.appendChild(descriptionP.childNodes[0]);
                if (descriptionP.childNodes[1]) titleP.appendChild(descriptionP.childNodes[1]);
                itemDiv.appendChild(titleP);

                if (item.example) {
                    const exampleTitle = createParagraph(`<span class="etymology-example-intro">例如:</span> `, undefined, true);
                    const exampleP = createBilingualParagraph(item.example);
                    exampleTitle.appendChild(exampleP.childNodes[0]);
                     if (exampleP.childNodes[1]) exampleTitle.appendChild(exampleP.childNodes[1]);
                    itemDiv.appendChild(exampleTitle);
                }
                q3Content.appendChild(itemDiv);
            });
        }
    }
}

function renderQuadrant4(data: WordAnalysisData['quadrant4']) {
    if (!q4Content || !data) return;
    q4Content.innerHTML = '';
    if (data.summary) {
        q4Content.appendChild(createParagraph(data.summary, undefined, true));
    }
}

function displayAnalysis(analysis: WordAnalysisData) {
    if (!analysis) return;
    clearPreviousData(false);
    if (centralWordH2) centralWordH2.textContent = analysis.word;
    renderQuadrant1(analysis.quadrant1);
    renderQuadrant2(analysis.quadrant2);
    renderQuadrant3(analysis.quadrant3);
    renderQuadrant4(analysis.quadrant4);
    wordAnalysisContainer?.classList.remove('hidden');
    initialMessageDiv?.classList.add('hidden');
}

// --- Vocabulary Book Functions ---
function loadVocabulary() {
    const storedVocab = localStorage.getItem(VOCABULARY_STORAGE_KEY);
    if (storedVocab) {
        try {
            vocabularyList = JSON.parse(storedVocab);
        } catch (e) { console.error("无法解析单词本数据:", e); vocabularyList = []; }
    } else { vocabularyList = []; }
    renderVocabularyList();
}

function saveVocabulary() {
    try {
        localStorage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(vocabularyList));
    } catch (e) { console.error("无法保存单词本:", e); showError("无法保存单词本到浏览器存储。"); }
}

function addWordToVocabulary(wordToAdd: string, analysisData: WordAnalysisData) {
    const normalizedWordToAdd = wordToAdd.toLowerCase();
    const existingEntryIndex = vocabularyList.findIndex(entry => entry.word.toLowerCase() === normalizedWordToAdd);

    if (existingEntryIndex !== -1) {
        vocabularyList[existingEntryIndex].analysisData = analysisData;
        vocabularyList[existingEntryIndex].word = wordToAdd; // Update casing if needed
        const updatedEntry = vocabularyList.splice(existingEntryIndex, 1)[0];
        updatedEntry.addedTimestamp = Date.now();
        vocabularyList.unshift(updatedEntry);
    } else {
        vocabularyList.unshift({
            word: wordToAdd,
            marked: false,
            addedTimestamp: Date.now(),
            analysisData: analysisData
        });
    }
    saveVocabulary();
    renderVocabularyList();
    extractAndAddMorphologicalParts(wordToAdd, analysisData.quadrant1.etymology);
}

function handleDeleteWordFromVocab(wordToDelete: string) {
    const normalizedWord = wordToDelete.toLowerCase();
    vocabularyList = vocabularyList.filter(entry => entry.word.toLowerCase() !== normalizedWord);
    saveVocabulary();
    renderVocabularyList();

    [rootBook, affixBook].forEach(book => {
        book.forEach(entry => {
            entry.associatedWords = entry.associatedWords.filter(w => w.toLowerCase() !== normalizedWord);
        });
    });
    rootBook = rootBook.filter(entry => entry.associatedWords.length > 0);
    affixBook = affixBook.filter(entry => entry.associatedWords.length > 0);
    
    saveRootBook();
    saveAffixBook();
    renderRootBookList();
    renderAffixBookList();

    if (vocabularyList.length === 0 && wordAnalysisContainer?.classList.contains('hidden')) {
        initialMessageDiv?.classList.remove('hidden');
    }
}

function handleToggleMarkWordInVocab(wordToMark: string) {
    const entry = vocabularyList.find(entry => entry.word.toLowerCase() === wordToMark.toLowerCase());
    if (entry) {
        entry.marked = !entry.marked;
        saveVocabulary();
        renderVocabularyList();
    }
}

async function handleWordClickInVocab(word: string) {
    const entry = vocabularyList.find(e => e.word.toLowerCase() === word.toLowerCase());
    wordInput.value = entry ? entry.word : word;

    if (entry && entry.analysisData) {
        clearPreviousData();
        showLoading(true);
        setTimeout(() => { 
            displayAnalysis(entry.analysisData!);
            showMainAppView();
            showLoading(false);
        }, 50);
    } else {
        await handleLearnWord(entry ? entry.word : word);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderVocabularyList() {
    if (!vocabularyListUl || !emptyVocabularyMessageP) return;
    vocabularyListUl.innerHTML = '';
    
    const itemsToRender = showOnlyMarkedVocab ? vocabularyList.filter(entry => entry.marked) : vocabularyList;

    if (itemsToRender.length === 0) {
        emptyVocabularyMessageP.textContent = showOnlyMarkedVocab ? '没有收藏的单词。' : '单词本是空的，快去学习新单词吧！';
        emptyVocabularyMessageP.classList.remove('hidden');
        if (API_KEY && initialMessageDiv && wordAnalysisContainer?.classList.contains('hidden') && !showOnlyMarkedVocab) {
            initialMessageDiv.classList.remove('hidden');
        }
        return;
    }
    emptyVocabularyMessageP.classList.add('hidden');
    if (initialMessageDiv && !wordAnalysisContainer?.classList.contains('hidden')) {
        initialMessageDiv.classList.add('hidden');
    }

    itemsToRender.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'list-item vocabulary-item';
        if (entry.marked) li.classList.add('marked');
        li.dataset.word = entry.word;

        const textContentDiv = document.createElement('div');
        textContentDiv.className = 'item-text-content';
        const wordSpan = document.createElement('span');
        wordSpan.className = 'item-text';
        wordSpan.textContent = entry.word;
        wordSpan.addEventListener('click', () => handleWordClickInVocab(entry.word));
        textContentDiv.appendChild(wordSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';
        const markButton = document.createElement('button');
        markButton.className = 'mark-button action-button';
        markButton.innerHTML = entry.marked ? '🌟' : '⭐';
        markButton.setAttribute('aria-label', entry.marked ? `取消标记 ${entry.word}` : `标记 ${entry.word}`);
        markButton.addEventListener('click', () => handleToggleMarkWordInVocab(entry.word));
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button action-button';
        deleteButton.innerHTML = '🗑️';
        deleteButton.setAttribute('aria-label', `删除 ${entry.word}`);
        deleteButton.addEventListener('click', () => handleDeleteWordFromVocab(entry.word));
        
        actionsDiv.appendChild(markButton);
        actionsDiv.appendChild(deleteButton);
        li.appendChild(textContentDiv);
        li.appendChild(actionsDiv);
        vocabularyListUl.appendChild(li);
    });
}

// --- Root Book & Affix Book Functions ---
function loadMorphologicalBook(key: string, defaultBook: MorphologicalBookEntry[]): MorphologicalBookEntry[] {
    const stored = localStorage.getItem(key);
    if (stored) {
        try {
            const parsedBook: MorphologicalBookEntry[] = JSON.parse(stored);
            // Ensure `marked` property exists
            return parsedBook.map(entry => ({
                ...entry,
                part: {
                    ...entry.part,
                    marked: entry.part.marked === undefined ? false : entry.part.marked
                }
            }));
        } catch (e) {
            console.error(`无法解析 ${key} 数据:`, e);
            return defaultBook;
        }
    }
    return defaultBook;
}

function loadRootBook() {
    rootBook = loadMorphologicalBook(ROOT_BOOK_STORAGE_KEY, []);
    renderRootBookList();
}
function saveRootBook() {
    try { localStorage.setItem(ROOT_BOOK_STORAGE_KEY, JSON.stringify(rootBook)); } catch (e) { console.error("无法保存词根本:", e); }
}
function loadAffixBook() {
    affixBook = loadMorphologicalBook(AFFIX_BOOK_STORAGE_KEY, []);
    renderAffixBookList();
}
function saveAffixBook() {
    try { localStorage.setItem(AFFIX_BOOK_STORAGE_KEY, JSON.stringify(affixBook)); } catch (e) { console.error("无法保存词缀本:", e); }
}

function extractAndAddMorphologicalParts(word: string, etymology: DetailedEtymology) {
    const partsToAdd: { detail: EtymologyPart, type: 'root' | 'prefix' | 'suffix' }[] = [];
    if (etymology.prefix && etymology.prefix.name) partsToAdd.push({ detail: etymology.prefix, type: 'prefix' });
    if (etymology.root && etymology.root.name) partsToAdd.push({ detail: etymology.root, type: 'root' });
    if (etymology.suffix && etymology.suffix.name) partsToAdd.push({ detail: etymology.suffix, type: 'suffix' });

    let rootBookChanged = false;
    let affixBookChanged = false;

    partsToAdd.forEach(item => {
        const isRoot = item.type === 'root';
        const targetBook = isRoot ? rootBook : affixBook;
        const partKey = `${item.type}-${item.detail.name.toLowerCase()}`;
        
        let entry = targetBook.find(e => `${e.part.type}-${e.part.name.toLowerCase()}` === partKey);
        if (!entry) {
            entry = {
                part: { ...item.detail, type: item.type, marked: false }, // Initialize marked
                associatedWords: []
            };
            targetBook.push(entry);
            if (isRoot) rootBookChanged = true; else affixBookChanged = true;
        }
        if (!entry.associatedWords.map(w => w.toLowerCase()).includes(word.toLowerCase())) {
            entry.associatedWords.push(word);
            if (isRoot) rootBookChanged = true; else affixBookChanged = true;
        }
    });

    if (rootBookChanged) {
        rootBook.sort((a,b) => a.part.name.localeCompare(b.part.name));
        saveRootBook();
        renderRootBookList();
    }
    if (affixBookChanged) {
        affixBook.sort((a,b) => a.part.name.localeCompare(b.part.name));
        saveAffixBook();
        renderAffixBookList();
    }
}

function renderBookList(
    listUl: HTMLUListElement | null, 
    emptyMessageP: HTMLElement | null, 
    bookData: MorphologicalBookEntry[],
    bookTypeLabel: '词根' | '词缀',
    showOnlyMarked: boolean,
    emptyMsgWhenFiltered: string,
    emptyMsgGeneral: string
) {
    if (!listUl || !emptyMessageP) return;
    listUl.innerHTML = '';

    const itemsToRender = showOnlyMarked ? bookData.filter(entry => entry.part.marked) : bookData;

    if (itemsToRender.length === 0) {
        emptyMessageP.textContent = showOnlyMarked ? emptyMsgWhenFiltered : emptyMsgGeneral;
        emptyMessageP.classList.remove('hidden');
        return;
    }
    emptyMessageP.classList.add('hidden');

    itemsToRender.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'list-item';
        if (entry.part.marked) li.classList.add('marked');
        li.dataset.name = entry.part.name;
        li.dataset.type = entry.part.type;

        const textContentDiv = document.createElement('div');
        textContentDiv.className = 'item-text-content';

        const textSpan = document.createElement('span');
        textSpan.className = 'item-text';
        textSpan.textContent = entry.part.name;
        textContentDiv.appendChild(textSpan);
        
        const typeSpan = document.createElement('span');
        typeSpan.className = 'item-type-label';
        const typeDisplay = entry.part.type === 'root' ? '词根' : entry.part.type === 'prefix' ? '前缀' : '后缀';
        typeSpan.textContent = `(${typeDisplay})`;
        textContentDiv.appendChild(typeSpan);
        textContentDiv.addEventListener('click', () => handleMorphologicalPartClick(entry));
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'item-actions';
        const markButton = document.createElement('button');
        markButton.className = 'mark-button action-button';
        markButton.innerHTML = entry.part.marked ? '🌟' : '⭐';
        markButton.setAttribute('aria-label', entry.part.marked ? `取消标记 ${entry.part.name}` : `标记 ${entry.part.name}`);
        markButton.addEventListener('click', () => handleToggleMarkRootOrAffix(entry.part.name, entry.part.type));
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button action-button';
        deleteButton.innerHTML = '🗑️';
        deleteButton.setAttribute('aria-label', `删除 ${entry.part.name}`);
        deleteButton.addEventListener('click', () => handleDeleteRootOrAffix(entry.part.name, entry.part.type));

        actionsDiv.appendChild(markButton);
        actionsDiv.appendChild(deleteButton);

        li.appendChild(textContentDiv);
        li.appendChild(actionsDiv);
        listUl.appendChild(li);
    });
}

function renderRootBookList() {
    renderBookList(rootListUl, emptyRootBookMessageP, rootBook, '词根', showOnlyMarkedRoots, '没有收藏的词根。', '词根本是空的。');
}
function renderAffixBookList() {
    renderBookList(affixListUl, emptyAffixBookMessageP, affixBook, '词缀', showOnlyMarkedAffixes, '没有收藏的词缀。', '词缀本是空的。');
}

// --- Item Detail View Functions (for Roots/Affixes) ---
function showMainAppView() {
    if (mainContentArea) mainContentArea.classList.remove('hidden');
    if (itemDetailViewDiv) itemDetailViewDiv.classList.add('hidden');
}

function showItemDetailView(entry: MorphologicalBookEntry) {
    if (!itemDetailTitleH2 || !itemDetailDefinitionDiv || !itemDetailRelatedWordsUl || !itemDetailViewDiv || !mainContentArea) return;

    const typeDisplay = entry.part.type === 'root' ? '词根' : entry.part.type === 'prefix' ? '前缀' : '后缀';
    itemDetailTitleH2.textContent = `${entry.part.name} (${typeDisplay}详情)`;
    
    itemDetailDefinitionDiv.innerHTML = '';
    itemDetailDefinitionDiv.appendChild(createParagraph(`<strong>含义:</strong> ${entry.part.meaning}`, undefined, true));
    if(entry.part.origin) itemDetailDefinitionDiv.appendChild(createParagraph(`<strong>来源:</strong> ${entry.part.origin}`, undefined, true));
    if(entry.part.details) itemDetailDefinitionDiv.appendChild(createParagraph(`<strong>详情:</strong> ${entry.part.details}`, undefined, true));
    if (entry.part.examples && entry.part.examples.length > 0) {
        const p = createParagraph('');
        const strong = document.createElement('strong');
        strong.textContent = '示例词 (来自词源): ';
        p.appendChild(strong);
        p.appendChild(document.createTextNode(entry.part.examples.join(', ')));
        itemDetailDefinitionDiv.appendChild(p);
    }
     // Display marked status
    const markedStatusP = createParagraph(entry.part.marked ? '<strong>状态:</strong> 已收藏 🌟' : '<strong>状态:</strong> 未收藏 ⭐', undefined, true);
    itemDetailDefinitionDiv.appendChild(markedStatusP);


    itemDetailRelatedWordsUl.innerHTML = '';
    entry.associatedWords.forEach(word => {
        const vocabEntry = vocabularyList.find(v => v.word.toLowerCase() === word.toLowerCase());
        if (vocabEntry) {
            const li = document.createElement('li');
            li.textContent = vocabEntry.word;
            li.addEventListener('click', () => {
                handleWordClickInVocab(vocabEntry.word);
            });
            itemDetailRelatedWordsUl.appendChild(li);
        }
    });
     if (itemDetailRelatedWordsUl.children.length === 0) {
        itemDetailRelatedWordsUl.innerHTML = '<li>暂无来自您单词本的相关单词。</li>';
    }

    mainContentArea.classList.add('hidden');
    itemDetailViewDiv.classList.remove('hidden');
    itemDetailContentDiv.scrollTop = 0;
}

function handleMorphologicalPartClick(entry: MorphologicalBookEntry) {
    if (entry) {
        showItemDetailView(entry);
    }
}

// --- Mark/Delete Handlers for Roots/Affixes ---
function handleToggleMarkRootOrAffix(partName: string, type: 'root' | 'prefix' | 'suffix') {
    const isRootBook = type === 'root';
    const targetBook = isRootBook ? rootBook : affixBook;
    const entry = targetBook.find(e => e.part.name.toLowerCase() === partName.toLowerCase() && e.part.type === type);
    if (entry) {
        entry.part.marked = !entry.part.marked;
        if (isRootBook) {
            saveRootBook();
            renderRootBookList();
        } else {
            saveAffixBook();
            renderAffixBookList();
        }
    }
}

function handleDeleteRootOrAffix(partName: string, type: 'root' | 'prefix' | 'suffix') {
    const isRootBook = type === 'root';
    if (isRootBook) {
        rootBook = rootBook.filter(e => !(e.part.name.toLowerCase() === partName.toLowerCase() && e.part.type === type));
        saveRootBook();
        renderRootBookList();
    } else {
        affixBook = affixBook.filter(e => !(e.part.name.toLowerCase() === partName.toLowerCase() && e.part.type === type));
        saveAffixBook();
        renderAffixBookList();
    }
    // Note: This does not currently remove the now-deleted root/affix from the etymology section
    // of words in the vocabularyList that might still reference it. This could be a future enhancement.
}


// --- Filter Toggle Handlers ---
function toggleFilter(bookType: 'vocabulary' | 'roots' | 'affixes') {
    let button: HTMLButtonElement | null = null;
    let filterState: boolean;
    let renderFunc: () => void;

    switch (bookType) {
        case 'vocabulary':
            showOnlyMarkedVocab = !showOnlyMarkedVocab;
            filterState = showOnlyMarkedVocab;
            button = toggleFilterVocabButton;
            renderFunc = renderVocabularyList;
            break;
        case 'roots':
            showOnlyMarkedRoots = !showOnlyMarkedRoots;
            filterState = showOnlyMarkedRoots;
            button = toggleFilterRootsButton;
            renderFunc = renderRootBookList;
            break;
        case 'affixes':
            showOnlyMarkedAffixes = !showOnlyMarkedAffixes;
            filterState = showOnlyMarkedAffixes;
            button = toggleFilterAffixesButton;
            renderFunc = renderAffixBookList;
            break;
        default: return;
    }

    if (button) {
        button.textContent = filterState ? '显示全部' : '显示收藏';
        button.setAttribute('aria-pressed', filterState.toString());
    }
    renderFunc();
}


// --- Main Learning Function ---
async function handleLearnWord(wordFromVocab?: string) {
    const wordToLearn = wordFromVocab || wordInput.value.trim();
    if (!wordToLearn) {
        showError("请输入一个单词。");
        return;
    }
     if (!API_KEY || !ai) {
        showError("API密钥未配置。无法获取单词详情。");
        return;
    }

    clearPreviousData();
    showLoading(true);
    initialMessageDiv?.classList.add('hidden');
    showMainAppView();

    let genAIResponse: GenerateContentResponse | undefined;

    const prompt = `
你是一位专业的语言学家和词典编纂者。请使用“四象限多感官记单词法”来分析英文单词 "${wordToLearn}"。
请严格遵循详细的JSON结构和内容类别。所有纯描述性文本输出【必须为简体中文】。
对于需要中英对照的字段，请使用 {"en": "English text", "zh": "中文文本"} 的格式。
不要在任何文本字段中使用Markdown斜体标记 (如 *)。
JSON中的 "word" 键应准确反映所分析的单词，包括其原始大小写。

JSON结构要求：
- "word": "原始大小写的单词"
- "quadrant1": {
    "overallCoreConcept": "（可选）对此单词所有含义的一个总体核心概念的简短中文描述。",
    "senses": [
      {
        "senseTitle": "例如：'包裹，邮包' (名词) 📦 (中文词性和可选表情符号)",
        "coreFeeling": "对此特定含义的核心感觉画面的详细中文描述。",
        "contexts": [ 
          { "sentence": {"en": "English sentence 1.", "zh": "中文例句1。"}, "youglishSearchUrl": "可选的Youglish URL" }
          // 最多3个语境示例
        ] 
      }
    ],
    "synonymsAntonyms": { 
      "category1_synonyms": [ {"en": "synonym1", "zh": "近义词1"}, {"en": "synonym2", "zh": "近义词2"} ],
      "category2_antonyms": [ {"en": "antonym1", "zh": "反义词1"} ]
    },
    "etymology": { 
      "main": "（可选）关于词源的总体介绍性中文文字。",
      "prefix": { "name": "前缀名", "meaning": "中文含义", "origin": "来源", "details": "可选中文细节", "examples": ["例词1", "例词2"] },
      "root": { "name": "词根名", "meaning": "中文含义", "origin": "来源", "details": "可选中文细节", "examples": ["例词1", "例词2"] },
      "suffix": { "name": "后缀名", "meaning": "中文含义", "origin": "来源", "details": "可选中文细节", "examples": ["例词1", "例词2"] },
      "literalLogic": "（可选）基于词根词缀的字面逻辑中文解释。"
    }
  }
- "quadrant2": {
    "pronunciation": { "ipa": "IPA发音", "tip": "中文发音技巧/提示" },
    "collocations": [ {"en": "collocation 1", "zh": "固定搭配1"} ] // 最多3个
  }
- "quadrant3": {
    "spellingBreakdown": "单词的中文拼写分解或记忆提示。",
    "aiMnemonics": "（可选）AI提供的额外中文助记方法（图形想象、谐音等）。",
    "derivatives": [
      { "word": "派生词本身", "pos": "词性(中文)", 
        "meaning": {"en": "English meaning", "zh": "中文含义"}, 
        "example": {"en": "Optional English example", "zh": "可选中文例句"} }
    ],
    "confusingRelatedWords": {
      "main": "（可选）对易混/相关词的总体中文说明。",
      "comparisons": [
        { "word": "相关词本身", 
          "description": {"en": "English description", "zh": "中文描述/区别"}, 
          "example": {"en": "Optional English example", "zh": "可选中文例句"} }
      ]
    }
  }
- "quadrant4": { "summary": "中文总结性的练习与掌握建议。" }

请为单词 "${wordToLearn}" 提供全面而丰富的分析。确保遵守上述所有格式和语言要求。
对于 "quadrant1.senses.contexts"，请确保每个sense最多提供3个语境示例。
`;

    try {
        genAIResponse = await ai.models.generateContent({
            model: "gemini-2.5-pro-preview-06-05", 
            contents: prompt,
            config: {
                responseMimeType: "application/json",
            }
        });

        let jsonString = genAIResponse.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonString.match(fenceRegex);
        if (match && match[2]) {
            jsonString = match[2].trim();
        }

        const data: WordAnalysisData = JSON.parse(jsonString);
        const displayWord = data.word || wordToLearn;
        data.word = displayWord;

        displayAnalysis(data);
        addWordToVocabulary(displayWord, data);

    } catch (error) {
        console.error("获取或解析单词数据时出错:", error);
        let message = `学习单词 "${wordToLearn}" 失败。`;
        if (error instanceof Error) {
            if (error.message.includes('JSON')) {
                message += "响应格式无效。请检查API返回的数据。";
            } else if (genAIResponse && genAIResponse.text && genAIResponse.text.length < 100) {
                 message += `收到的API响应似乎不完整或无效: ${genAIResponse.text.substring(0,100)}...`;
            } else {
                 message += `错误详情: ${error.message}`;
            }
        } else {
            message += "发生未知错误。";
        }
        showError(message);
    } finally {
        showLoading(false);
        if (!wordFromVocab) wordInput.value = '';
    }
}

// --- Event Listeners and Initialization ---
if (learnButton) {
    learnButton.addEventListener('click', () => handleLearnWord());
}
if (wordInput) {
    wordInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleLearnWord();
        }
    });
}
if (backToMainViewButton) {
    backToMainViewButton.addEventListener('click', showMainAppView);
}

if (toggleFilterVocabButton) {
    toggleFilterVocabButton.addEventListener('click', () => toggleFilter('vocabulary'));
}
if (toggleFilterRootsButton) {
    toggleFilterRootsButton.addEventListener('click', () => toggleFilter('roots'));
}
if (toggleFilterAffixesButton) {
    toggleFilterAffixesButton.addEventListener('click', () => toggleFilter('affixes'));
}


function initializeApp() {
    showLoading(false);
    loadVocabulary();
    loadRootBook();
    loadAffixBook();
    showMainAppView();

    const isApiKeyMissing = !API_KEY;
    if (learnButton) learnButton.disabled = isApiKeyMissing;
    if (wordInput) wordInput.disabled = isApiKeyMissing;

    if (isApiKeyMissing) {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = '配置错误：API密钥未找到。应用程序的主要功能将无法使用。';
            errorMessageDiv.classList.remove('hidden');
        }
        initialMessageDiv?.classList.add('hidden');
    } else {
        if (initialMessageDiv && vocabularyList.length === 0 && wordAnalysisContainer?.classList.contains('hidden')) {
             initialMessageDiv.classList.remove('hidden');
        } else if (initialMessageDiv) {
            initialMessageDiv.classList.add('hidden');
        }
    }
     // Initialize button texts based on default filter state (false = "Show Favorites")
    [toggleFilterVocabButton, toggleFilterRootsButton, toggleFilterAffixesButton].forEach(button => {
        if (button) button.textContent = '显示收藏';
    });
}

initializeApp();
