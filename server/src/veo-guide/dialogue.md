## 2.1.1 Battle-Tested Dialogue Techniques

### Proven Dialogue Syntax (Community-Verified)

**✅ WORKS - Colon Format (Prevents Subtitles):**
```
The detective looks directly at camera and says: "Something's not right here." His voice carries suspicion and determination.
```

**❌ FAILS - Quote Format (Causes Subtitles):**
```
The detective says: "Something's not right here." (Avoid this format)
```

### Phonetic Pronunciation Fixes

**Problem**: AI mispronounces names or complex words
**Solution**: Use phonetic spelling

```
Original: "Read on to get Fofur and Shridar's guidance"
Fixed: "Read on to get foh-fur's and Shreedar's guidance"
```

### Dialogue Length Optimization

**Perfect Length (8-second rule):**
```
Sarah, a confident CEO, looks at camera and says: "Our Q3 results exceeded all expectations, positioning us for unprecedented growth."
```

**Too Long (Causes rushed speech):**
```
Avoid: Long paragraphs that require 15+ seconds to speak naturally
```

**Too Short (Causes silence/gibberish):**
```
Avoid: Single words like "Hello" or "Yes"
```

### Multi-Character Dialogue Control

**Specify Who Speaks When:**
```
The woman in the red dress asks: "Where should we meet for lunch?" The man in the blue shirt replies: "How about that new Italian place downtown?"
```

**Character-Specific Dialogue:**
```
The woman wearing pink says: "But I'm the one who's wearing pink." The man with glasses replies: "No, I'm the one with the glasses."
```

### AI-Generated Dialogue Prompts

**Let Veo 3 Create Natural Dialogue:**
```
- A standup comic tells a joke
- Two people discuss a movie they just watched
- A man argues passionately over the phone
- A woman shares her inspiring life story
- A teacher explains a complex concept to students
```

### Subtitle Prevention Techniques (Proven Methods)

**Method 1 - Colon Format:**
```
Use: Character says: "dialogue" (with colon before dialogue)
Avoid: Character says "dialogue" (no colon - triggers subtitles)

KEY: The colon (:) prevents subtitle generation
```

**Method 2 - Explicit Negation:**
```
Add to prompt: "(no subtitles)" or "no subtitles, no text overlays"
```

**Method 3 - Multiple Negatives (For Stubborn Cases):**
```
"No subtitles. No subtitles! No on-screen text whatsoever."
```

### Audio Hallucination Fixes

**Problem**: Unwanted "live studio audience" laughter
**Solution**: Always specify expected background audio

```
Bad: Character tells a joke (may add unwanted laughter)
Good: Character tells a joke. Audio: quiet office ambiance, no audience sounds, professional atmosphere.
```

**Environmental Audio Specification:**
```
Audio: sounds of distant bands, noisy crowd, ambient background of a busy festival field (prevents wrong audio hallucinations)
```
