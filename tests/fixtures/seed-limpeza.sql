-- Seed para validar scripts/limpar-provas.cjs no banco descartável de testes.
--
-- As migrations já semeiam a rede (19 escolas, 8 turmas, 106 alunos, 218
-- matrículas, 212 habilidades). Aqui só criamos os usuários e a camada de
-- provas por cima: duas provas em aplicações distintas, uma delas derivada
-- (para exercitar o ciclo aplicacoes <-> provas), com questões, alternativas,
-- resultados e respostas.
--
-- Idempotente: pode rodar várias vezes sem duplicar nada.
-- NÃO usar em produção. Só tem efeito em banco de teste.

-- usuários (não vêm das migrations)
INSERT INTO users (name, email, password_hash, role, school)
VALUES ('Prof. Ana', 'ana@teste.local', 'x', 'teacher', 'Escola Um'),
       ('Admin Teste', 'admin@teste.local', 'x', 'admin', 'Secretaria de Educação')
ON CONFLICT (email) DO NOTHING;

-- duas aplicações
INSERT INTO aplicacoes (codigo, titulo, data_inicio, data_fim, status, criado_por)
SELECT 'APL-TESTE-001', 'Aplicação Conjunta (teste)', now(), now() + interval '30 days',
       'ativa', (SELECT id FROM users WHERE email = 'admin@teste.local')
WHERE NOT EXISTS (SELECT 1 FROM aplicacoes WHERE codigo = 'APL-TESTE-001');

INSERT INTO aplicacoes (codigo, titulo, data_inicio, data_fim, status, criado_por)
SELECT 'APL-TESTE-002', 'Aplicação Avulsa (teste)', now(), now() + interval '7 days',
       'ativa', (SELECT id FROM users WHERE email = 'admin@teste.local')
WHERE NOT EXISTS (SELECT 1 FROM aplicacoes WHERE codigo = 'APL-TESTE-002');

-- três provas: compartilhada, avulsa e derivada (ciclo com prova_origem_id)
INSERT INTO provas (codigo, titulo, disciplina, escola_id, data_inicio, data_fim,
                    tempo_minutos, status, professor_id, aplicacao_id)
SELECT 'PROVA-TESTE-001', 'Prova Compartilhada (teste)', 'MATEMATICA', e.id,
       now(), now() + interval '30 days', 60, 'publicada',
       (SELECT id FROM users WHERE email = 'ana@teste.local'),
       (SELECT id FROM aplicacoes WHERE codigo = 'APL-TESTE-001')
FROM escolas e WHERE e.codigo = 1
  AND NOT EXISTS (SELECT 1 FROM provas WHERE codigo = 'PROVA-TESTE-001');

INSERT INTO provas (codigo, titulo, disciplina, escola_id, data_inicio, data_fim,
                    tempo_minutos, status, professor_id, aplicacao_id)
SELECT 'PROVA-TESTE-002', 'Prova Avulsa (teste)', 'PORTUGUES', e.id,
       now(), now() + interval '7 days', 45, 'publicada',
       (SELECT id FROM users WHERE email = 'ana@teste.local'),
       (SELECT id FROM aplicacoes WHERE codigo = 'APL-TESTE-002')
FROM escolas e WHERE e.codigo = 2
  AND NOT EXISTS (SELECT 1 FROM provas WHERE codigo = 'PROVA-TESTE-002');

INSERT INTO provas (codigo, titulo, disciplina, escola_id, data_inicio, data_fim,
                    tempo_minutos, status, professor_id, aplicacao_id)
SELECT 'PROVA-TESTE-003', 'Prova Derivada (teste)', 'CIENCIAS', e.id,
       now(), now() + interval '7 days', 30, 'rascunho',
       (SELECT id FROM users WHERE email = 'ana@teste.local'),
       (SELECT id FROM aplicacoes WHERE codigo = 'APL-TESTE-002')
FROM escolas e WHERE e.codigo = 1
  AND NOT EXISTS (SELECT 1 FROM provas WHERE codigo = 'PROVA-TESTE-003');

-- fecha o ciclo aplicacoes <-> provas
UPDATE aplicacoes SET prova_origem_id = (SELECT id FROM provas WHERE codigo = 'PROVA-TESTE-002')
WHERE codigo = 'APL-TESTE-002' AND prova_origem_id IS NULL;

-- duas questões em cada prova
INSERT INTO questoes (prova_id, numero, pergunta, tipo, valor, ordem, habilidade)
SELECT p.id, 1, 'Quanto é 2+2?', 'multipla_escolha', 1, 1, ARRAY['EF03LP01']
FROM provas p
WHERE p.codigo IN ('PROVA-TESTE-001', 'PROVA-TESTE-002', 'PROVA-TESTE-003')
  AND NOT EXISTS (SELECT 1 FROM questoes q WHERE q.prova_id = p.id AND q.numero = 1);

INSERT INTO questoes (prova_id, numero, pergunta, tipo, valor, ordem, habilidade)
SELECT p.id, 2, 'Qual o nome de um rio brasileiro?', 'multipla_escolha', 1, 2, ARRAY['EF03LP01']
FROM provas p
WHERE p.codigo IN ('PROVA-TESTE-001', 'PROVA-TESTE-002', 'PROVA-TESTE-003')
  AND NOT EXISTS (SELECT 1 FROM questoes q WHERE q.prova_id = p.id AND q.numero = 2);

-- alternativas A/B/C em cada questão
INSERT INTO alternativas (questao_id, letra, texto, correta)
SELECT q.id, 'A', 'Alternativa A', true FROM questoes q
WHERE NOT EXISTS (SELECT 1 FROM alternativas al WHERE al.questao_id = q.id AND al.letra = 'A');
INSERT INTO alternativas (questao_id, letra, texto, correta)
SELECT q.id, 'B', 'Alternativa B', false FROM questoes q
WHERE NOT EXISTS (SELECT 1 FROM alternativas al WHERE al.questao_id = q.id AND al.letra = 'B');
INSERT INTO alternativas (questao_id, letra, texto, correta)
SELECT q.id, 'C', 'Alternativa C', false FROM questoes q
WHERE NOT EXISTS (SELECT 1 FROM alternativas al WHERE al.questao_id = q.id AND al.letra = 'C');

-- vínculos da aplicação conjunta com turmas e escolas
INSERT INTO aplicacao_turmas (aplicacao_id, turma_id)
SELECT a.id, t.id FROM aplicacoes a, turmas t
WHERE a.codigo = 'APL-TESTE-001'
  AND NOT EXISTS (SELECT 1 FROM aplicacao_turmas at WHERE at.aplicacao_id = a.id AND at.turma_id = t.id);

INSERT INTO aplicacao_escolas (aplicacao_id, escola_id)
SELECT a.id, e.id FROM aplicacoes a, escolas e
WHERE a.codigo = 'APL-TESTE-001'
  AND NOT EXISTS (SELECT 1 FROM aplicacao_escolas ae WHERE ae.aplicacao_id = a.id AND ae.escola_id = e.id);

-- resultados e respostas na prova avulsa, para o script ter o que apagar
INSERT INTO resultados (prova_id, aluno_id, aluno_nome, aluno_turma, escola_nome, acertos, erros, nota, percentual)
SELECT p.id, a.id, a.nome, 'Turma Teste', 'Escola Dois', 1, 1, 5, 50
FROM provas p, alunos a
WHERE p.codigo = 'PROVA-TESTE-002'
  AND NOT EXISTS (SELECT 1 FROM resultados r WHERE r.prova_id = p.id AND r.aluno_id = a.id);

-- 10 alunos com matrícula real (turma_id e aluno_turma são NOT NULL).
-- aluno_turma/escola_nome são snapshots em texto: o relatório precisa sobreviver
-- a uma turma que foi desativada depois.
INSERT INTO respostas_alunos (prova_id, aluno_id, turma_id, aluno_nome, aluno_turma,
                              escola_nome, questao_id, alternativa_id, correta)
SELECT p.id, m.aluno_id, m.turma_id, a.nome, t.nome, e.nome, q.id, alt.id, alt.correta
FROM provas p
CROSS JOIN (SELECT DISTINCT aluno_id, turma_id FROM matriculas ORDER BY aluno_id LIMIT 10) m
JOIN alunos a ON a.id = m.aluno_id
JOIN turmas t ON t.id = m.turma_id
JOIN escolas e ON e.id = t.escola_id
CROSS JOIN questoes q
JOIN alternativas alt ON alt.questao_id = q.id
WHERE p.codigo = 'PROVA-TESTE-002' AND q.prova_id = p.id
  AND NOT EXISTS (SELECT 1 FROM respostas_alunos ra
                  WHERE ra.prova_id = p.id AND ra.aluno_id = m.aluno_id AND ra.questao_id = q.id);
