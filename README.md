---
# ARQUITETURA REFATORADA - SISTEMA DE PROTEÇÃO VEICULAR
**Versão: 1.0**
**Data: 28/04/2026**
---

## 📋 SUMÁRIO EXECUTIVO

A refatoração refere-se a uma reestruturação completa do modelo de dados baseada em **Domain-Driven Design (DDD)**, eliminando redundâncias de precificação e estabelecendo uma **única fonte de verdade** para cálculo de preços.

### 🎯 Objetivos Alcançados

✅ Eliminou 4 tabelas redundantes de precificação (`produto_preco`, `produto_grupos`, `faixas_preco`, `faixa_preco_itens`)
✅ Substituiu entidade `adesao` por `contrato` com melhor semântica
✅ Implementou versionamento de preço imutável
✅ Padronizou uso de UUID como PK
✅ Criou agregados bem definidos por domínio
✅ Modelo pronto para escalar com milhares de associados

---

## 🏗️ ARQUITETURA DDD - AGREGADOS

### 1️⃣ AGREGADO: ASSOCIADO
**Raiz**: Associado
**Responsabilidade**: Dados pessoais, contatos, endereços, documentos

```
associados
├── contatos
├── enderecos
└── documentos
```

### 2️⃣ AGREGADO: VEÍCULO
**Raiz**: Veiculo
**Responsabilidade**: Frota do associado com classificação e FIPE

```
marcas ─┬─ modelos ─┬─ tipos_veiculo
        │           │
        └───────┬──┘
             veiculos ─┬─ grupos_veiculo
                       └─ fipe_referencias
```

### 3️⃣ AGREGADO: PRODUTO
**Raiz**: Produto
**Responsabilidade**: Catálogo de benefícios com categorias

```
produtos ──┬─ planos
           ├─ plano_produtos
           └─ regras_preco [precificação]
```

### 4️⃣ AGREGADO: PRECIFICAÇÃO ⭐ ÚNICA FONTE DE VERDADE
**Raiz**: RegraPreco
**Responsabilidade**: Cálculo unificado de preços

```
regras_preco ────┬─ faixas_fipe
                 ├─ precos_faixa_fipe
                 └─ regional
```

**Tipos de Cálculo**:
- `FIXO`: Preço constante
- `PERCENTUAL_FIPE`: % do valor FIPE
- `FAIXA_FIPE`: Por faixa de valor do veículo

### 5️⃣ AGREGADO: CONTRATO (Novo!)
**Raiz**: Contrato (substitui Adesao)
**Responsabilidade**: Contratação com histórico e preços imutáveis

```
contratos ────┬─ contrato_produtos
              ├─ contrato_status_historico
              └─ associado
                └─ veiculo
                └─ plano
                └─ regional
```

---

## 📊 MODELO RELACIONAL SIMPLIFICADO

### Entidades Principais

#### ASSOCIADOS
```sql
associados (
  id UUID PK,
  cpf VARCHAR(11) UNIQUE,
  nome VARCHAR(100),
  email VARCHAR(100),
  ativo BOOLEAN,
  ...
)
```

#### VEÍCULOS
```sql
veiculos (
  id UUID PK,
  associado_id UUID FK,
  modelo_id UUID FK,
  grupo_veiculo_id UUID FK,        -- Nova! Classificação
  ano INT,
  placa VARCHAR(10),
  chassi VARCHAR(17),
  cor VARCHAR(50),
  combustivel VARCHAR(50),
  ...
)
```

#### PRODUTOS (antes: beneficios)
```sql
produtos (
  id UUID PK,
  nome VARCHAR(255),
  descricao TEXT,
  tipo ENUM(base, adicional),
  categoria ENUM(seguro, assistencia, desconto, outros),
  ativo BOOLEAN,
  ...
)
```

#### REGRAS DE PREÇO ⭐ NOVA
```sql
regras_preco (
  id UUID PK,
  produto_id UUID FK,
  grupo_veiculo_id UUID FK,
  regional_id UUID FK,
  nome VARCHAR(255),
  tipo_calculo ENUM(fixo, faixa_fipe, percentual_fipe),
  valor_fixo DECIMAL(10,2),         -- quando tipo = FIXO
  percentual_fipe DECIMAL(5,2),     -- quando tipo = PERCENTUAL_FIPE
  taxa_administrativa DECIMAL(10,2),
  desconto_nao_particular DECIMAL(10,2),
  data_inicio DATE,
  data_fim DATE,
  ativa BOOLEAN,
  UNIQUE(produto_id, grupo_veiculo_id, regional_id, data_inicio)
)
```

#### FAIXAS FIPE ⭐ NOVA
```sql
faixas_fipe (
  id UUID PK,
  nome VARCHAR(100),                -- ex: "até R$ 50mil"
  valor_minimo DECIMAL(12,2),
  valor_maximo DECIMAL(12,2),
  ...
)
```

#### PREÇOS POR FAIXA ⭐ NOVA
```sql
precos_faixa_fipe (
  id UUID PK,
  regra_preco_id UUID FK,
  faixa_fipe_id UUID FK,
  valor DECIMAL(10,2),
  UNIQUE(regra_preco_id, faixa_fipe_id)
)
```

#### CONTRATOS ⭐ NOVO (substitui adesao)
```sql
contratos (
  id UUID PK,
  numero VARCHAR(20) UNIQUE,        -- CTR-2026-000001
  associado_id UUID FK,
  veiculo_id UUID FK,
  plano_id UUID FK,
  regional_id UUID FK,
  data_inicio DATE,
  data_fim DATE,
  status ENUM(pendente, analise, aprovado, reprovado, cancelado, inativo),
  valor_total DECIMAL(10,2),
  forma_pagamento ENUM(mensal, anual, boleto, debito),
  vistoria_obrigatoria BOOLEAN,
  vistoria_aprovada BOOLEAN,
  ...
)
```

#### PRODUTOS DO CONTRATO ⭐ NOVO
```sql
contrato_produtos (
  id UUID PK,
  contrato_id UUID FK,
  produto_id UUID FK,
  preco_contratado DECIMAL(10,2),   -- IMUTÁVEL!
  valor_original DECIMAL(10,2),
  percentual_desconto DECIMAL(5,2),
  data_contratacao TIMESTAMP,
  regra_preco_id UUID FK,           -- qual regra gerou o preço
  ...
)
```

#### HISTÓRICO DE STATUS DO CONTRATO ⭐ NOVO
```sql
contrato_status_historico (
  id UUID PK,
  contrato_id UUID FK,
  status ENUM(...),
  observacao TEXT,
  usuario_id UUID FK,
  data_status TIMESTAMP,
  ...
)
```

---

## 🔄 FLUXOS DO SISTEMA

### FLUXO 1: CADASTRO DE ASSOCIADO
```
POST /associados
  ├─ Cria Associado
  ├─ Cria Contatos
  ├─ Cria Endereços
  └─ Cria Documentos
```

### FLUXO 2: CADASTRO DE VEÍCULO
```
POST /veiculos
  ├─ Associa a Associado
  ├─ Associa a Modelo
  ├─ Associa a GrupoVeiculo
  └─ [Opcional] Obtém FIPE e armazena em cache
```

### FLUXO 3: CÁLCULO DE PREÇO (ÚNICA FONTE)
```
POST /precificacao/calcular
  │
  ├─ [1] Busca valor FIPE
  │   └─ SELECT valor FROM fipe_referencias 
  │       WHERE modelo_id = ? AND ano = ?
  │
  ├─ [2] Identifica grupo do veículo
  │   └─ SELECT grupo_veiculo_id FROM veiculos WHERE id = ?
  │
  ├─ [3] Busca REGRA DE PREÇO (única!)
  │   └─ SELECT * FROM regras_preco
  │       WHERE produto_id = ?
  │       AND grupo_veiculo_id = ?
  │       AND regional_id = ?
  │       AND ativa = true
  │
  ├─ [4] Calcula conforme tipo_calculo:
  │   │
  │   ├─ FIXO: retorna valor_fixo
  │   │
  │   ├─ PERCENTUAL_FIPE: retorna valor_fipe * (percentual / 100)
  │   │
  │   └─ FAIXA_FIPE:
  │       ├─ Identifica faixa: valor_fipe >= min AND valor_fipe <= max
  │       └─ Busca preço: SELECT valor FROM precos_faixa_fipe
  │
  ├─ [5] Aplica taxa administrativa (opcional)
  │   └─ preco_final = preco_base + taxa_administrativa
  │
  └─ Retorna { precoCalculado, regraUtilizada, componentes }
```

### FLUXO 4: CONTRATAÇÃO (ADESÃO)
```
POST /contratos
  │
  ├─ [1] Valida associado e veículo
  │
  ├─ [2] Para cada PRODUTO do plano:
  │   ├─ Calcula preço (via fluxo 3)
  │   ├─ Cria ContratoProduto com preço IMUTÁVEL
  │   └─ Associa à regra_preco utilizada
  │
  ├─ [3] Cria Contrato com número automático
  │   └─ Número: CTR-YYYY-NNNNNN
  │
  ├─ [4] Se vistoria obrigatória:
  │   └─ Cria registro em Vistorias (status: agendada)
  │
  └─ Retorna Contrato + Produtos + Preços
```

### FLUXO 5: APROVAÇÃO DE CONTRATO
```
PUT /contratos/{id}/status
  │
  ├─ Valida vistoria (se obrigatória)
  ├─ Atualiza status para 'aprovado'
  ├─ Cria histórico em contrato_status_historico
  └─ Retorna Contrato atualizado
```

---

## 🗑️ MUDANÇAS NA ESTRUTURA

### ❌ TABELAS REMOVIDAS (Substituídas)
| Tabela | Motivo | Substituída por |
|--------|--------|-----------------|
| `produto_preco` | Redundante | `regras_preco` |
| `produto_grupos` | Redundante | `regras_preco` |
| `faixa_preco_itens` | Redesenho | `precos_faixa_fipe` |
| `faixas_preco` | Redesenho | `faixas_fipe` |
| `tabelas_preco` | Metadado de importação | (remove, versionar regras) |
| `adesao` | Renomeação semântica | `contrato` |
| `analises` | Integrado no contrato | `contrato_status_historico` |
| `beneficios` | Renomeação | `produtos` |

### ✅ TABELAS MANTIDAS (com ajustes)
| Tabela Anterior | Tabela Nova | Ajustes |
|-----------------|-------------|---------|
| `associados` | `associados` | PK: int → UUID |
| `veiculos` | `veiculos` | + grupoVeiculoId, + fieldsAdicionais, PK: int → UUID |
| `produtos` | `produtos` | + categoria ENUM, + relação regrasPreco, PK: int → UUID |
| `planos` | `planos` | + descrição, + relação contratos, PK: int → UUID |
| `regionais` | `regionais` | + codigo, + relação regrasPreco, PK: int → UUID |
| `grupos_veiculo` | `grupos_veiculo` | + descrição, - tabelasPreco, + regrasPreco, PK: int → UUID |
| `cobrancas` | `cobrancas` | Intacto, ajustar FKs |
| `vistorias` | `vistorias` | Intacto |
| `usuarios` | `usuarios` | Intacto |

### ➕ TABELAS NOVAS
- `regras_preco` (ÚNICA FONTE DE VERDADE)
- `faixas_fipe`
- `precos_faixa_fipe`
- `contratos` (substitui adesao)
- `contrato_produtos` (com preço imutável)
- `contrato_status_historico` (auditoria)

---

## 🔐 GARANTIAS DE CONSISTÊNCIA

### 1️⃣ Preço Imutável
- Armazenado em `contrato_produtos.preco_contratado`
- Nunca alterado após criação
- Referencia regra utilizada para rastreabilidade

### 2️⃣ Única Regra por Combinação
```sql
UNIQUE(produto_id, grupo_veiculo_id, regional_id, data_inicio)
```
- Impossível ter 2 regras iguais no mesmo período
- Versionamento por data_inicio

### 3️⃣ Transações Atômicas
- Criação de Contrato + Produtos in transaction
- Se falhar, rollback completo

### 4️⃣ Auditoria Completa
- Histórico de status em `contrato_status_historico`
- Quem, o quê, quando
- Identificação de regra por contrato_produtos.regra_preco_id

---

## 📈 ESCALABILIDADE

### Preparado para:
- ✅ **Milhares de associados**: Índices em cpf, email
- ✅ **Múltiplas regionais**: Filtro natural por regional_id
- ✅ **Regras complexas**: Suporta 3 tipos de cálculo, extensível
- ✅ **Histórico de preço**: Versionamento por data_inicio
- ✅ **Promoções futuras**: Campo percentual_desconto
- ✅ **Rateio**: Já modelado em FaixaPreco
- ✅ **Contratos digitais**: Estrutura preparada para assinaturas

---

## 🚀 PRÓXIMOS PASSOS

### 1. Criar Migrações TypeORM
```bash
npx typeorm migration:create src/database/migrations/001-novo-modelo
```

### 2. Migrar Dados (com cuidado!)
```sql
-- Inserir regras de preço baseado em produto_preco
INSERT INTO regras_preco (...)
SELECT ... FROM produto_preco;
```

### 3. Atualizar Métodos de Serviço
- `ContratoService.create()`: Calcula preços no contrato
- `PrecificacaoNovaService.calcular()`: Lógica única de preço

### 4. Testes Integrados
- Cálculo de preço: 5 tipos de cenários
- Contrato: Criar, aprovar, cancelar
- Histórico: Verificar auditoria

### 5. Descontinuar Antigos (gradualmente)
- Manter adesao por 3 meses (migração de dados)
- Alertar APIs que usam produto_preco
- Deprecate endpoints antigos

---

## 📝 NOMENCLATURA PADRÃO

### Tabelas (plural, snake_case)
- ✅ `contratos`, `contrato_produtos`, `contrato_status_historico`
- ✅ `regras_preco`, `faixas_fipe`, `precos_faixa_fipe`
- ❌ `contrato`, `regraPreco`, `FaixasFipe`

### Colunas (snake_case)
- ✅ `preco_contratado`, `data_inicio`, `forma_pagamento`
- ❌ `precoContratado`, `dataInicio`, `formaPagamento`

### Enums (UPPERCASE)
- ✅ `TipoCalculo.FIXO`, `ContratoStatus.PENDENTE`
- ✅ DB: `tipo_calculo ENUM('fixo', 'percentual_fipe', 'faixa_fipe')`

### PKs e FKs (sempre UUID)
- ✅ `id UUID PRIMARY KEY`
- ✅ `contrato_id UUID FOREIGN KEY`
- ❌ `id INT`, `contrato_id INT`

---

## 🎓 DECISÕES ARQUITETURAIS

| Decisão | Motivo |
|---------|--------|
| **UUID para PK** | Melhor distribuição, menos colisões, escalabilidade |
| **Agregados por domínio** | Boundaries claros, independência entre módulos |
| **Regra de preço única** | Elimina inconsistências, fonte de verdade centralizada |
| **Preço imutável no contrato** | Auditoria, rastreabilidade de preços históricos |
| **Versionamento por data** | Permite múltiplas versões de regras ativas |
| **Status em tabela separada** | Auditoria completa sem alterar contrato |
| **Grupo no veículo, não em adesão** | Dado imutável, não muda no contrato |
| **Regional no contrato** | Possibilita contrato em diferentes regionais |

---

## 📞 SUPORTE

**Dúvidas sobre a arquitetura?**
- Revisar DER em `/docs/DER-novo-modelo.md`
- Exemplos de queries: `/docs/QUERIES.sql`
- Testes integrados: `/test/contrato.e2e-spec.ts`

---

**Versão: 1.0 | Atualizado: 28/04/2026 | Status: ✅ Pronto para Implementação**
