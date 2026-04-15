-- Add Skills tables for simplified skill system

-- Skills table - defines available skills with their tools
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    tools JSONB NOT NULL DEFAULT '[]',
    config JSONB,
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HaseefSkill junction table - attaches skills to haseefs
CREATE TABLE haseef_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    haseef_id TEXT NOT NULL,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    config JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(haseef_id, skill_id)
);

-- Create index for faster lookups
CREATE INDEX idx_haseef_skills_haseef_id ON haseef_skills(haseef_id);
CREATE INDEX idx_haseef_skills_skill_id ON haseef_skills(skill_id);
CREATE INDEX idx_skills_is_builtin ON skills(is_builtin);

-- Insert default built-in skills
INSERT INTO skills (name, description, tools, is_builtin) VALUES
('web_search', 'Search the web for information', '[
  {
    "name": "search_web",
    "description": "Search the web for current information on any topic",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {"type": "string", "description": "Search query"},
        "num_results": {"type": "number", "description": "Number of results (default 5)"}
      },
      "required": ["query"]
    }
  }
]'::jsonb, true),

('code_execution', 'Execute code snippets safely', '[
  {
    "name": "run_code",
    "description": "Execute code in a sandboxed environment",
    "inputSchema": {
      "type": "object",
      "properties": {
        "language": {"type": "string", "enum": ["python", "javascript"], "description": "Programming language"},
        "code": {"type": "string", "description": "Code to execute"}
      },
      "required": ["language", "code"]
    }
  }
]'::jsonb, true),

('image_generation', 'Generate images from text descriptions', '[
  {
    "name": "generate_image",
    "description": "Generate an image from a text prompt",
    "inputSchema": {
      "type": "object",
      "properties": {
        "prompt": {"type": "string", "description": "Image description"},
        "size": {"type": "string", "enum": ["256x256", "512x512", "1024x1024"], "description": "Image size"}
      },
      "required": ["prompt"]
    }
  }
]'::jsonb, true),

('data_analysis', 'Analyze data and create visualizations', '[
  {
    "name": "analyze_data",
    "description": "Analyze structured data and provide insights",
    "inputSchema": {
      "type": "object",
      "properties": {
        "data": {"type": "string", "description": "JSON or CSV data to analyze"},
        "question": {"type": "string", "description": "What to analyze for"}
      },
      "required": ["data", "question"]
    }
  }
]'::jsonb, true);
