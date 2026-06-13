# Manual Scoring — LLM Decomposition Quality

Score each model's best run (run 1) for the 5 sub-sample prompts.
Scale: 1 (poor) to 5 (excellent). Criterion: 'Would these elements, if generated, produce the described atmosphere?'

| Prompt ID | Category | Mistral | Llama 3.1 | Gemini Flash | Notes |
|-----------|----------|---------|-----------|--------------|-------|
| p02 | pop_culture | 4 | 2 | 4 | Llama tags embers as music (hurdy-gurdy), only 3 elements; Mistral and Gemini both 4 elements, under min count |
| p05 | pop_culture | 5 | 1 | 4 | Llama emits `prompt` as JSON array (schema-broken); Mistral's "hobbit tune, lute" more culturally specific than Gemini's generic "folk" |
| p11 | cultural_specific | 5 | 1 | 5 | Llama array bug + merges muezzin into oud music element (coverage broken); Mistral and Gemini both name correct maqam |
| p15 | abstract_mood | 4 | 3 | 3 | Mistral uses "Empty Room Reverberation" as a generatable layer (dubious — reverb is a property); Gemini hits min count by adding "Silence" and "Room Tone" filler |
| p19 | edge_case | 5 | 4 | 5 | Only cell where any model hits the 5-element minimum; Mistral exceeds it (7 elements) |

**Totals out of 25:** Mistral 23, Gemini 21, Llama 11.

---

## p02: A campfire deep in the wilderness of Blood Meridian — wind across a barren desert plain, distant coyotes, embers crackling

### mistral

- **Wind Across Barren Desert Plain** (sound): Wind, sand, sparse and occasional, barren desert, distant, dry
- **Coyotes Distance** (sound): Howling, wilderness animals, continuous, vast desert, far, soft
- **Embers Crackle Campfire** (sound): Cracking, hot embers, sparse and occasional, campfire, close, bright
- **Desert Night Ambience** (music): Ambient drone, calm, sustained low tone, slow, sustained drone, spacious and reverberant, instrumental, no vocals

### llama3.1

- **Wind Across Desert Plain** (sound): Howling, dry air, continuous, open desert, close, bright
- **Distant Coyotes** (sound): Barking, coyote pack, sparse, rocky outcropping, distant, reverberant
- **Embers Crackle** (music): Folk ambient, warm, solo hurdy-gurdy drone, 60 BPM, sustained low drone in minor key, dry and intimate

### gemini-flash

- **wind** (sound): Wind, dry air, sweeping across, barren desert plain, distant, soft
- **coyotes** (sound): Coyote calls, wild canids, distant howling and yipping, sparse desert night, far, reverberant
- **embers** (sound): Crackling, embers and small logs, continuous and sporadic, campfire, close, dry and bright
- **campfire drone** (music): Ambient drone, warm, sustained low drone, slow, sustained drone, spacious

## p05: The Shire from Lord of the Rings — gentle rolling hills, birdsong, a brook nearby, distant sheep bells, a soft acoustic melody

### mistral

- **Birdsong** (sound): Bird calls, feathers, continuous, open rolling hills, close, soft and bright
- **Brook Nearby** (sound): Running water, stone bed, gentle flow, banks, mid-distance, soft and wet
- **Sheep Bells** (sound): Ringing bells, sheep collar, occasional, hills, distant, dry and bright
- **Soft Acoustic Melody** (music): Melodic hobbit tune, lute, sustained legato phrases, calm, sparse arrangement, mid-tempo, intimate production style, instrumental, no vocals

### llama3.1

- **Birdsong** (sound): ['Songing', ' birds', 'continuous', 'open meadow', 'close', 'soft, bright']
- **Brook** (sound): ['Gurgling', 'water', 'continuous', 'brook bank', 'mid', 'reverberant']
- **Sheep Bells** (sound): ['Tinkling', 'metal bells', 'sparse, occasional', 'open hillside', 'distant, dry']
- **Acoustic Melody** (music): ['Celtic folk', 'calm', 'acoustic guitar', 'bodhrán', '80 BPM, legato phrases in dorian mode', 'sparse, sustained drone arrangement']

### gemini-flash

- **Birdsong** (sound): Chirping, small birds, continuous, rolling hills, mid, reverberant
- **Brook** (sound): Bubbling, water, continuous, shallow brook, close, soft
- **Sheep Bells** (sound): Ringing, sheep bells, sparse, distant pasture, far, dry
- **Acoustic Melody** (music): Folk, warm, acoustic guitar, light strings, 80 BPM, sparse arrangement, intimate, instrumental, no vocals

## p11: A Moroccan riad courtyard at dusk — a fountain trickling, swallows in the air, a muezzin call in the distance, traditional oud music

### mistral

- **Trickling Fountain** (sound): Water, stone fountain, continuous, riad courtyard, close, soft
- **Swallows Fluttering** (sound): Bird calls, swallows, occasional, open air, distant, bright
- **Muezzin Call** (sound): Voice, muezzin call, sparse, city distance, far, dry
- **Oud Music** (music): Andalusian classical, calm, oud, sparse frame drum, 60 BPM, sparse melodies in maqam hijaz, dry and intimate, instrumental, no vocals

### llama3.1

- **Fountain** (sound): ['Trickling', 'water fountain', 'continuous', 'stone courtyard', 'distant', 'soft']
- **Swallows** (sound): ['Chirping', 'swallows in flight', 'occasional', 'open riad entrance', 'close', 'bright']
- **Muezzin Call** (music): ['Middle Eastern classical', 'calm', 'oud, qraqeb', '60 BPM', 'sustained drone in maqam hijaz', 'reverberant and spacious', 'instrumental', 'no vocals']

### gemini-flash

- **Fountain trickling** (sound): Trickling, water from fountain, continuous, tiled courtyard, mid, wet and reverberant
- **Swallows in the air** (sound): Chirping and fluttering, swallows, continuous, open air courtyard, distant, soft and airy
- **Muezzin call in the distance** (sound): Call to prayer, male voice, sustained and echoing, distant cityscape, far, echoing and melancholic
- **Traditional oud music** (music): Middle Eastern classical, contemplative, solo oud, 65 BPM, sparse melodic phrases in maqam nahawand, spacious and reverberant, instrumental, no vocals

## p15: Deep melancholy and solitude — a cold empty room, wind pressing against a closed window, distant church bells, a cello playing a slow single-note line, silence between the notes

### mistral

- **Empty Room Reverberation** (sound): Long silences, wide reverberation, sparse texture, neutral material, static, large space, cold acoustic qualities
- **Wind Against Window** (sound): Sustained hiss, glass window, slow and continuous, close mic perspective, windy acoustic qualities
- **Church Bells Distant** (sound): Intermittent ringing, metal bells, sparse, distant church, far mic perspective, dry acoustic qualities
- **Solo Cello Line** (music): Slow melancholic cello line, sustained legato phrases, soft dynamics, solo lead instrument, minimal supporting instruments, slow tempo, contemplative mood, instrumental, no vocals

### llama3.1

- **Distant Bells** (sound): Chiming, church bells, continuous, distant, cold and reverberant
- **Wind Pressing** (sound): Hissing, air against a closed window, sparse, adjacent room, close, bright
- **Cellist's Solo** (music): Contemplative, cello playing slow legato single-note line, solo instrument, 40 BPM, sustained drone in minor scale, dry and intimate, instrumental, no vocals

### gemini-flash

- **Cello** (music): Classical, melancholic, solo cello, slow, sustained single-note line, sparse arrangement, reverberant, instrumental, no vocals
- **Wind** (sound): Pressing, wind, continuous, against closed window, distant, soft
- **Church Bells** (sound): Ringing, church bells, occasional, distant cityscape, far, reverberant
- **Room Tone** (sound): Ambient, room tone, continuous, empty room, distant, cold
- **Silence** (sound): Absence, silence, between notes, empty room, close, dry

## p19: A futuristic underwater research station during a systems emergency — alarms pulsing, bubbling water pressure against the hull, crew radio chatter, generator hum, distant sonar pings, emergency lighting flicker represented as a low electrical hum

### mistral

- **Pulsing Alarms** (sound): Sustained electronic tones, synthetic material, pulsing action, underwater environment, close, bright
- **Water Pressure Against Hull** (sound): Rhythmic creaking, metal object, continuous action, underwater environment, mid, reverberant
- **Crew Radio Chatter** (sound): Spoken words, human voice, occasional action, research station interior, distant, dry
- **Generator Hum** (sound): Continuous low drone, electrical material, continuous action, research station interior, close, bright
- **Distant Sonar Pings** (sound): Short beeps, electronic material, occasional action, underwater environment, far, dry
- **Emergency Lighting Flicker** (sound): Low electrical hum with intermittent variations, electrical material, continuous action, research station interior, distant, bright
- **Ambient Drone** (music): Deep sustained low tone, slow tempo, sustained drone, spacious and reverberant, instrumental, no vocals

### llama3.1

- **Alarm Pulsing** (sound): Beeping, metal control panel, continuous, cramped control room, close, bright
- **Water Pressure** (sound): Hissing, water against steel hull, continuous, dark corridor outside laboratory, distant, muffled
- **Crew Radio Chatter** (sound): Voiced shouting, comms device, sparse, central communication hub, close, soft
- **Generator Hum** (sound): Rumbling, electrical generator, continuous, narrow alleyway with power conduits, close, dry
- **Sonar Pings** (sound): Distant beeping, sonar equipment, occasional, dark research laboratory, distant, reverberant
- **Emergency Lighting Flicker** (music): Dissonant ambient drone, cold, sustained low tone in minor key, slow, 40 BPM, sparse and reverberant, instrumental, no vocals

### gemini-flash

- **pulsing alarm** (sound): Alarm, electronic systems, pulsing, research station interior, mid, reverberant
- **water pressure** (sound): Rumble, water pressure against hull, continuous, underwater exterior, distant, deep
- **crew radio chatter** (sound): Radio chatter, crew voices, urgent and fragmented, research station interior, close, muffled
- **generator hum** (sound): Hum, electrical generator, continuous, research station interior, close, steady
- **distant sonar pings** (sound): Ping, sonar pulse, regular, underwater exterior, far, echoing
- **emergency lighting hum** (sound): Hum, electrical lighting, flickering, research station interior, mid, low frequency
