import { useState, useEffect } from "react";
import { skillsApi, haseefsApi, type Skill, type HaseefSkill, type HaseefListItem } from "../lib/api.js";
import {
  Wrench,
  Plus,
  X,
  Bot,
  Sparkles,
  Code,
  Search,
  Image,
  BarChart3,
  Loader2,
} from "lucide-react";

// Skill icon mapping
function getSkillIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("search")) return Search;
  if (lower.includes("code") || lower.includes("exec")) return Code;
  if (lower.includes("image") || lower.includes("generate")) return Image;
  if (lower.includes("data") || lower.includes("analy")) return BarChart3;
  return Sparkles;
}

function SkillCard({
  skill,
  attachedHaseefs,
  onAttach,
  onDetach,
  haseefs,
}: {
  skill: Skill;
  attachedHaseefs: string[];
  onAttach: (skillId: string, haseefId: string) => void;
  onDetach: (skillId: string, haseefId: string) => void;
  haseefs: HaseefListItem[];
}) {
  const [showAttach, setShowAttach] = useState(false);
  const Icon = getSkillIcon(skill.name);

  return (
    <div className="bg-card border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{skill.name}</h3>
            {skill.isBuiltin && (
              <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                Built-in
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {skill.description || "No description"}
          </p>
          <div className="mt-2 text-xs text-muted-foreground">
            {skill.tools.length} tool{skill.tools.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Attached Haseefs */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Attached to:</span>
          {haseefs.length > 0 && (
            <button
              onClick={() => setShowAttach(!showAttach)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Attach
            </button>
          )}
        </div>

        {attachedHaseefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not attached to any haseef</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attachedHaseefs.map((haseefId) => {
              const haseef = haseefs.find((h) => h.haseefId === haseefId);
              if (!haseef) return null;
              return (
                <span
                  key={haseefId}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground text-sm rounded-full"
                >
                  <Bot className="w-3 h-3" />
                  {haseef.name}
                  <button
                    onClick={() => onDetach(skill.id, haseefId)}
                    className="ml-1 p-0.5 hover:bg-secondary-foreground/10 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Attach Dropdown */}
        {showAttach && (
          <div className="mt-2 p-2 border rounded-md bg-background">
            <p className="text-sm font-medium mb-2">Select haseef:</p>
            <div className="space-y-1">
              {haseefs
                .filter((h) => !attachedHaseefs.includes(h.haseefId))
                .map((haseef) => (
                  <button
                    key={haseef.haseefId}
                    onClick={() => {
                      onAttach(skill.id, haseef.haseefId);
                      setShowAttach(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-secondary rounded text-left"
                  >
                    <Bot className="w-4 h-4" />
                    {haseef.name}
                  </button>
                ))}
              {haseefs.filter((h) => !attachedHaseefs.includes(h.haseefId)).length === 0 && (
                <p className="text-sm text-muted-foreground">All haseefs have this skill</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [haseefSkills, setHaseefSkills] = useState<Record<string, HaseefSkill[]>>({});
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [skillsRes, haseefsRes] = await Promise.all([
        skillsApi.list(),
        haseefsApi.list(),
      ]);

      setSkills(skillsRes.skills);
      setHaseefs(haseefsRes.haseefs);

      // Load attached skills for each haseef
      const haseefSkillsMap: Record<string, HaseefSkill[]> = {};
      await Promise.all(
        haseefsRes.haseefs.map(async (haseef) => {
          try {
            const res = await skillsApi.listForHaseef(haseef.haseefId);
            haseefSkillsMap[haseef.haseefId] = res.skills;
          } catch {
            haseefSkillsMap[haseef.haseefId] = [];
          }
        })
      );
      setHaseefSkills(haseefSkillsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAttach(skillId: string, haseefId: string) {
    try {
      await skillsApi.attachToHaseef(haseefId, { skillId });
      const res = await skillsApi.listForHaseef(haseefId);
      setHaseefSkills((prev) => ({ ...prev, [haseefId]: res.skills }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to attach skill");
    }
  }

  async function handleDetach(skillId: string, haseefId: string) {
    try {
      await skillsApi.detachFromHaseef(haseefId, skillId);
      const res = await skillsApi.listForHaseef(haseefId);
      setHaseefSkills((prev) => ({ ...prev, [haseefId]: res.skills }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to detach skill");
    }
  }

  function getAttachedHaseefs(skillId: string): string[] {
    const attached: string[] = [];
    for (const [haseefId, hsList] of Object.entries(haseefSkills)) {
      if (hsList.some((hs) => hs.skillId === skillId && hs.isActive)) {
        attached.push(haseefId);
      }
    }
    return attached;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="w-6 h-6" />
              Skills
            </h1>
            <p className="text-muted-foreground mt-1">
              Attach skills to your haseefs to give them new abilities
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
            {error}
          </div>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Built-in Skills
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {skills
                  .filter((s) => s.isBuiltin)
                  .map((skill) => (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      attachedHaseefs={getAttachedHaseefs(skill.id)}
                      onAttach={handleAttach}
                      onDetach={handleDetach}
                      haseefs={haseefs}
                    />
                  ))}
              </div>
            </section>

            {skills.filter((s) => !s.isBuiltin).length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Custom Skills
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {skills
                    .filter((s) => !s.isBuiltin)
                    .map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        attachedHaseefs={getAttachedHaseefs(skill.id)}
                        onAttach={handleAttach}
                        onDetach={handleDetach}
                        haseefs={haseefs}
                      />
                    ))}
                </div>
              </section>
            )}

            {skills.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No skills available</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
