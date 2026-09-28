-- Integridade das submissões e da importação de alunos.
--
-- 1) resultados(prova_id, aluno_id) único: o /api/submissions fazia SELECT e depois
--    INSERT, então dois envios simultâneos passavam pela checagem e criavam dois
--    resultados para o mesmo aluno. A checagem continua na aplicação (evita ida ao
--    banco); o índice é o que fecha a corrida.
-- 2) alunos.cpf) único: o comentário no schema chama o CPF de "chave de dedupe da
--    importação", mas só havia índice comum — duas importações criavam a mesma
--    pessoa duas vezes. Só entra duplicata real (o próprio índice não se clean-up).

-- 1) Um resultado por aluno por prova.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT prova_id, aluno_id
      FROM resultados
      WHERE aluno_id IS NOT NULL
      GROUP BY prova_id, aluno_id
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION
      'resultados: existem duplicatas (prova_id, aluno_id). Resolva antes de aplicar esta migration.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS resultados_prova_aluno_uniq
  ON resultados (prova_id, aluno_id)
  WHERE aluno_id IS NOT NULL;

-- 2) Um aluno por CPF (parcial: só onde há CPF, que é o caso dos importados).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT cpf FROM alunos
      WHERE cpf IS NOT NULL AND btrim(cpf) <> ''
      GROUP BY cpf HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION
      'alunos: existem CPFs duplicados. Resolva antes de aplicar esta migration.';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS alunos_cpf_uniq
  ON alunos (cpf)
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';
