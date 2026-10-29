export const PHOTOSYNTHESIS_LESSON = [
  // 1. Header Title
  {
    type: 'write_text',
    id: 'title',
    x: 100,
    y: 80,
    text: 'Photosynthesis: Energy Transduction Arc',
    size: 'l',
    color: 'black',
  },
  {
    type: 'write_text',
    id: 'chemical_eqn',
    x: 100,
    y: 130,
    text: '6CO₂ + 6H₂O + Photons  ⟶  C₆H₁₂O₆ + 6O₂',
    size: 's',
    color: 'grey',
  },

  // 2. Stage I: Light Dependent Reaction Box (Thylakoid)
  {
    type: 'create_box',
    id: 'stage_1',
    x: 100,
    y: 220,
    w: 260,
    h: 120,
    geo: 'rectangle',
    color: 'green',
    fill: 'semi',
    dash: 'draw',
    text: 'Light-Dependent Reactions\n[ Thylakoid Membrane ]\n• H₂O Photolysis ⟶ O₂\n• Electron Transport Chain',
  },

  // 3. Photon Energy Input
  {
    type: 'create_note',
    id: 'solar_input',
    x: 100,
    y: 380,
    color: 'yellow',
    text: 'Input:\n☀️ Sunlight (Photons)\n💧 Water (H₂O)',
  },

  // 4. Energy Carrier Link (ATP & NADPH)
  {
    type: 'create_box',
    id: 'carriers',
    x: 440,
    y: 240,
    w: 180,
    h: 80,
    geo: 'ellipse',
    color: 'orange',
    fill: 'semi',
    dash: 'dashed',
    text: 'Chemical Energy\n[ ATP + NADPH ]',
  },

  // Arrow from Stage 1 -> Energy Carriers
  {
    type: 'draw_arrow',
    id: 'arrow_1',
    fromX: 360,
    fromY: 280,
    toX: 440,
    toY: 280,
    color: 'green',
  },

  // 5. Stage II: Light-Independent Reaction Box (Stroma)
  {
    type: 'create_box',
    id: 'stage_2',
    x: 700,
    y: 220,
    w: 260,
    h: 120,
    geo: 'rectangle',
    color: 'blue',
    fill: 'semi',
    dash: 'draw',
    text: 'Calvin-Benson Cycle\n[ Chloroplast Stroma ]\n• RuBisCO Carbon Fixation\n• G3P Synthesizer',
  },

  // Arrow from Carriers -> Stage 2
  {
    type: 'draw_arrow',
    id: 'arrow_2',
    fromX: 620,
    fromY: 280,
    toX: 700,
    toY: 280,
    color: 'orange',
  },

  // 6. Carbon Ingestion Note
  {
    type: 'create_note',
    id: 'co2_input',
    x: 700,
    y: 380,
    color: 'blue',
    text: 'Input:\n💨 Atmospheric CO₂\nFixed by enzyme RuBisCO',
  },

  // 7. Output Final Product
  {
    type: 'create_box',
    id: 'glucose_output',
    x: 1040,
    y: 240,
    w: 190,
    h: 80,
    geo: 'rhombus',
    color: 'red',
    fill: 'semi',
    dash: 'draw',
    text: 'Output:\nC₆H₁₂O₆ (Glucose)',
  },

  // Arrow from Stage 2 -> Glucose Output
  {
    type: 'draw_arrow',
    id: 'arrow_3',
    fromX: 960,
    fromY: 280,
    toX: 1040,
    toY: 280,
    color: 'red',
  },
];