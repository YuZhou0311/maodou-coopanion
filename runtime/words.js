/**
 * Maodou vocabulary registration, not an animation implementation or a QA result.
 * Native grammar: expression {like,seconds?}; motion {seconds,face?}.
 * A custom motion reaches figure.draw as frame.gesture.kind / k. It is not an
 * alias to a core motion. The figure must implement every registered custom id.
 * Manifest seconds are script wait times; expression holdSeconds are separate.
 * IDs use hyphens: the upstream manifest rejects underscores.
 */
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
const expression = (id, label, description, en, extra = {}) => ({ id, kind: 'expression', label, description, en, seconds: .9, ...extra });
const motion = (id, label, seconds, description, en, extra = {}) => ({ id, kind: 'motion', label, description, en, seconds, ...extra });

export const CORE_EXPRESSION_DEFINITIONS = freeze([
  expression('neutral', '平静', '放松的青色眼睛与小嘴，轻轻呼吸。', 'Relaxed cyan eyes, a small resting mouth, and gentle breathing.'),
  expression('happy', '开心', '开心地弯起眼睛，小嘴含笑，耳朵轻轻回应。', 'Happy curved eyes, a small smile, and a gentle ear response.'),
  expression('wink', '眨眼', '单眼眨一下，另一只青色眼睛保留。', 'A one-eye wink while the other cyan eye stays visible.'),
  expression('love', '喜欢', '温柔地望向你，脸颊微红，姿态亲近。', 'An affectionate gaze, a little blush, and a welcoming pose.'),
  expression('shy', '害羞', '视线轻轻躲开，脸红并微微低头。', 'Averted gaze, blushing cheeks, and a small head dip.'),
  expression('surprised', '惊讶', '青色眼睛睁圆，小嘴短暂张开。', 'Widened cyan eyes and a briefly open small mouth.'),
  expression('angry', '生气', '眉眼收紧，小嘴认真抿起，克制地鼓起劲。', 'Tighter brows and eyes with a small determined mouth.'),
  expression('sad', '难过', '眉尾放低、视线下垂，耳朵和重心轻轻沉下。', 'Lowered brows and gaze with softly drooping ears and posture.'),
  expression('sleepy', '犯困', '眼皮慢慢变沉，带一次小小的哈欠。', 'Heavy eyelids and a small, slow yawn.'),
  expression('thinking', '思考', '视线略向上偏，保持小口，轻轻歪头思考。', 'A slightly raised gaze and a thoughtful small head tilt.'),
  expression('smug', '得意', '眼皮略收，嘴角轻扬，露出一点小得意。', 'Slightly lowered eyelids and a restrained smug smile.'),
  expression('pout', '嘟嘴', '小嘴噘起，视线转开，脸颊微微发红。', 'A small pout with an averted gaze and a little blush.'),
  expression('worried', '担心', '眉间轻蹙，眼睛保留纵向形状，紧张地望着前方。', 'Worried brows and attentive eyes that keep their tall shape.'),
  expression('determined', '认真', '眼神专注，眉毛稍压，小爪稳稳收好。', 'Focused eyes, slightly lowered brows, and steady little paws.'),
  expression('flustered', '慌张', '眼睛短暂收紧，脸颊泛红，随后缓缓回稳。', 'A brief flustered squint and blush followed by a gentle recovery.'),
  expression('scared', '害怕', '睁大眼睛，眉毛上提，身体轻轻缩起。', 'Wide eyes, raised brows, and a small protective huddle.'),
  expression('excited', '兴奋', '眼睛更精神，小嘴开心，姿态轻快地提起。', 'Bright, alert eyes and an excited upward posture.'),
  expression('cry', '哭泣', '保留完整青色眼形，眉毛委屈，小泪滴从眼底落下。', 'Full cyan eyes, sad brows, and small tears falling from the lower lids.'),
  expression('confused', '疑惑', '两侧眉眼略有不同，带一点不解的歪头。', 'Slightly asymmetric brows and eyes with a puzzled head tilt.'),
]);

export const CORE_MOTION_DEFINITIONS = freeze([
  motion('stand', '站起', 1.2, '从坐姿或困倦姿势缓缓站稳。', 'Returns gently to a standing posture.'),
  motion('jump', '跳起来', 1.2, '蹲下蓄力后原地起跳，落地时柔软回弹。', 'Crouches, jumps on the spot, and settles softly after landing.'),
  motion('hop', '小跳', .9, '做一次幅度较小的轻跳。', 'A small, light hop.'),
  motion('look', '张望', 2.7, '在有限侧向关键形状之间观察周围。', 'Looks around within the authored side-view range.'),
  motion('turn', '转身', 1.2, '改变朝向，头耳连续转动而不压成薄片。', 'Changes heading through continuous head and ear movement.'),
  motion('nod', '点头', .8, '轻轻低头应答，然后回到原位。', 'A gentle nod followed by a return to rest.'),
  motion('shake', '摇头', .8, '克制地左右摇头。', 'A restrained side-to-side head shake.'),
  motion('spin', '小转动', .8, '在正面与侧面间轻快转动，不展示背面。', 'A small turn between front and side views, without a back view.'),
  motion('sit', '坐下', .8, '缓缓坐下，并保持坐姿。', 'Sits down and holds the seated pose.', { lasting: true }),
  motion('sleep', '睡觉', .8, '合眼休息，维持缓慢呼吸。', 'Closes the eyes and rests with slow breathing.', { lasting: true }),
  motion('dizzy', '晕乎乎', 3.2, '短暂晕乎，身体与耳朵轻轻晃动。', 'A brief dizzy wobble through the body and ears.'),
  motion('walk', '散步', 12, '按照原生身体路径走一段，脚步与耳尾跟随移动。', 'Walks using the native body path with coordinated feet, ears, and tail.'),
  motion('run', '跑起来', 12, '向另一边轻快跑动，并在停止时收稳。', 'Runs towards the other side and settles on stopping.'),
  motion('wave', '招手', 1.7, '举起一只短爪挥一挥。', 'Raises one short paw for a small wave.'),
  motion('bow', '鞠躬', 1.7, '合眼并轻轻低头致意。', 'Closes the eyes and dips the head in greeting.'),
  motion('shiver', '发抖', 1.9, '缩起身子做小幅抖动，然后放松。', 'Huddles for a small shiver, then relaxes.'),
  motion('flap', '扑腾', 1.5, '短暂起跳，双耳随身体轻轻扑动。', 'A brief hop with a soft response through both ears.'),
  motion('dance', '跳舞', 3.4, '踩着节奏左右摆动，耳尾带有柔软延迟。', 'Rhythmic side-to-side steps with soft ear and tail follow-through.'),
]);

export const CUSTOM_EXPRESSION_DEFINITIONS = freeze([
  expression('cozy', '安心', '眼弧柔和，嘴角放松，双耳安静地垂落。', 'Soft eye curves, a relaxed mouth, and calmly resting ears.', { like: 'content', holdSeconds: 3.4 }),
  expression('curious', '好奇', '带着上扬的视线轻轻探看，眉眼比思考更舒展。', 'An inquisitive upward gaze with more open brows than the thinking face.', { like: 'thinking', holdSeconds: 3.4 }),
  expression('bashful', '羞喜', '开心又害羞地收起小爪，眼弧和脸红一起渐入。', 'A shy, happy smile with tucked paws and a gently arriving blush.', { like: 'shy', holdSeconds: 3.4 }),
  expression('pleading', '委屈', '纵向青眼略含泪意，眉毛柔软地抬起，小嘴轻抿。', 'Tall cyan eyes, gently raised sad brows, and a small pleading mouth.', { like: 'worried', holdSeconds: 3.4 }),
  expression('proud', '小得意', '稍稍抬头，眼睛仍然柔和，小嘴带一点自豪。', 'A modest head lift with soft eyes and a quietly proud mouth.', { like: 'smug', holdSeconds: 3.4 }),
  expression('sparkle', '期待', '保留青色眼睛，轻轻提眉睁眼，略向前倾着等待。', 'Keeps the cyan eyes, gently raises the brows and lids, and leans forward expectantly.', { like: 'excited', holdSeconds: 3.4 }),
]);

export const CUSTOM_MOTION_DEFINITIONS = freeze([
  motion('ear-wave', '耳朵招手', 2.2, '一只耳朵主动抬起招手，另一只耳朵轻轻平衡。', 'One ear waves while the other softly balances the pose.', { face: 'happy' }),
  motion('ear-fold', '抱耳', 2.7, '双耳柔软地向内折，小爪靠近耳边。', 'Folds both ears softly inward while the paws move closer.', { face: 'cozy' }),
  motion('cuddle', '贴近抱抱', 3.0, '身体向前亲近，小爪合拢，耳朵轻柔包住动作。', 'Leans closer with gathered paws and softly surrounding ears.', { face: 'bashful' }),
  motion('peek', '左右探头', 2.8, '先向一侧探头，再经过正面观察另一侧。', 'Peeks to one side, then crosses the front to inspect the other.', { face: 'curious' }),
  motion('stretch', '伸懒腰', 3.2, '缓缓伸展身体和双耳，停留片刻后松下来。', 'Slowly stretches the body and ears, holds briefly, then relaxes.', { face: 'neutral' }),
  motion('sway', '轻轻摇摆', 3.0, '身体平缓地左右摇摆，耳尾略晚跟上。', 'Sways slowly from side to side with delayed ear and tail movement.', { face: 'cozy' }),
  motion('bounce', '尾巴弹跳', 2.4, '尾巴先轻轻弹动，带动身体做小幅回弹。', 'A small tail bounce leads into a restrained body rebound.', { face: 'happy' }),
  motion('doze', '打瞌睡', 3.6, '眼皮渐沉，头部点落后轻轻回神。', 'The eyelids grow heavy and the head dips before gently recovering.', { face: 'sleepy' }),
  motion('greet', '轻快招呼', 2.5, '抬头看向你，配合短爪与耳朵给出轻快回应。', 'Looks up with a coordinated paw and ear greeting.', { face: 'happy' }),
  motion('celebrate', '雀跃庆祝', 3.3, '小爪、耳尾与重心交替上扬，开心庆祝后回稳。', 'Celebrates with alternating lifts through paws, ears, tail, and posture.', { face: 'excited' }),
]);

export const CORE_EXPRESSIONS = freeze(CORE_EXPRESSION_DEFINITIONS.map(w => w.id));
export const CORE_MOTIONS = freeze(CORE_MOTION_DEFINITIONS.map(w => w.id));
export const CUSTOM_EXPRESSION_IDS = freeze(CUSTOM_EXPRESSION_DEFINITIONS.map(w => w.id));
export const CUSTOM_MOTION_IDS = freeze(CUSTOM_MOTION_DEFINITIONS.map(w => w.id));
export const WORD_DEFINITIONS = freeze([...CORE_EXPRESSION_DEFINITIONS, ...CUSTOM_EXPRESSION_DEFINITIONS, ...CORE_MOTION_DEFINITIONS, ...CUSTOM_MOTION_DEFINITIONS]);
export const WORD_LABELS = freeze(Object.fromEntries(WORD_DEFINITIONS.map(w => [w.id, w.label])));
export const WORD_DESCRIPTIONS = freeze(Object.fromEntries(WORD_DEFINITIONS.map(w => [w.id, w.description])));
export const CUSTOM_WORDS = freeze(Object.fromEntries([
  ...CUSTOM_EXPRESSION_DEFINITIONS.map(w => [w.id, { expression: { like: w.like, seconds: w.holdSeconds } }]),
  ...CUSTOM_MOTION_DEFINITIONS.map(w => [w.id, { motion: { seconds: w.seconds, face: w.face } }]),
]));
export const VOCAB = freeze(WORD_DEFINITIONS.map(w => ({ id: w.id, kind: w.kind, names: { zh: [w.label] },
  about: { zh: w.description, en: w.en }, seconds: w.seconds, ...(w.lasting ? { lasting: true } : {}) })));
export const PERSONALITY_AXES = freeze([{ id: 'personality', name: { zh: '性格', en: 'Personality' }, options: [
  { id: 'gentle', name: { zh: '温柔', en: 'Gentle' }, accent: '#90cada' },
  { id: 'lively', name: { zh: '活泼', en: 'Lively' }, accent: '#90cada' },
] }]);
export const VOCABULARY_STATUS = freeze({ registrationOnly: true, visualValidationClaimed: false,
  nativeExpressions: 19, customExpressions: 6, nativeMotions: 18, customMotions: 10,
  expressions: 25, motions: 28, total: 53 });
