from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = "postgresql://neondb_owner:npg_G9jBAgO0hpXr@ep-broad-sky-ate4cjbm.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"

def inicializar_banco():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # MIGRAÇÃO INTELIGENTE: Detecta schema antigo e limpa para recriar as tabelas perfeitas
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='codigos_parada' AND column_name='maquina';")
        if cursor.fetchone():
            cursor.execute("DROP TABLE IF EXISTS result_by_order, stop_machine_item, registro_turnos, codigos_parada, master_sku, tipos_tno, maquinas CASCADE;")
            conn.commit()

        # 1. Tabela de Usuários
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY, login VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(100) NOT NULL, nome VARCHAR(255) NOT NULL, nivel INT DEFAULT 1
            );
        """)
        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES ('admin', 'admin', 'Administrador Global', 3);")

        # 2. Tabela de Máquinas
        cursor.execute("CREATE TABLE IF NOT EXISTS maquinas (id SERIAL PRIMARY KEY, numero_maquina INT UNIQUE NOT NULL, tipo VARCHAR(50) NOT NULL);")
        cursor.execute("SELECT COUNT(*) FROM maquinas;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO maquinas (numero_maquina, tipo) VALUES (1, 'adult_care'), (2, 'baby_care'), (3, 'baby_care'), (4, 'baby_care'), (5, 'baby_care'), (6, 'baby_care'), (7, 'adult_care');")

        # 3. Tipos de TNO
        cursor.execute("CREATE TABLE IF NOT EXISTS tipos_tno (id SERIAL PRIMARY KEY, nome VARCHAR(100) UNIQUE NOT NULL);")
        cursor.execute("SELECT COUNT(*) FROM tipos_tno;")
        if cursor.fetchone()[0] == 0:
            tnos = ['Manutenção', 'Limpeza', 'Ajuste de Partida de Máquina', 'Troca de Tamanho de Máquina', 'Ajuste Após Troca de Tamanho Máquina', 'Troca de Optima', 'Troca de Dosetec', 'Checagem de Liberação do Operador', 'Parada Programada', 'Parada por Falta / Problema de MP', 'Liberação de Linha Qualidade', 'Amostragem (Sampling)', 'Segurança do Trabalho', 'Outros']
            for tno in tnos:
                cursor.execute("INSERT INTO tipos_tno (nome) VALUES (%s) ON CONFLICT (nome) DO NOTHING;", (tno,))

        # 4. SKUs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS master_sku (
                id SERIAL PRIMARY KEY, codigo_sku VARCHAR(100) UNIQUE NOT NULL, descricao VARCHAR(255),
                fraldas_por_pacote INT NOT NULL, pacotes_por_fardo INT NOT NULL, fardos_por_pallet INT NOT NULL
            );
        """)
        cursor.execute("SELECT COUNT(*) FROM master_sku;")
        if cursor.fetchone()[0] == 0:
            skus_carga = [
                ('1000', 'RN-TESTE', 4, 63, 18), ('2000', 'P-TESTE', 4, 48, 18), ('3000', 'M-TESTE', 1, 120, 18), 
                ('4000', 'G-TESTE', 1, 120, 18), ('5000', 'XG-TESTE', 1, 100, 18), ('6000', 'XXG-TESTE', 1, 100, 18),
                ('11151', 'P50 IGUAÇU', 50, 4, 25), ('12111', 'M20 IGUAÇU', 20, 6, 30), ('12121', 'G17 IGUAÇU', 17, 6, 36), 
                ('12131', 'XG15 IGUAÇU', 15, 6, 36), ('12141', 'P24 Cuidado Real', 24, 6, 24), ('12151', 'XXG13 IGUAÇU', 13, 6, 32),
                ('12161', 'M18 IGUAÇU', 18, 6, 36), ('12171', 'G16 IGUAÇU', 16, 6, 30), ('12181', 'XG14 IGUAÇU', 14, 6, 36),
                ('12191', 'XXG12 IGUAÇU', 12, 6, 32), ('12201', 'P22 IGUAÇU', 22, 6, 30), ('12301', 'RN20 D&N', 20, 6, 30),
                ('13101', 'G28 D&N', 28, 4, 32), ('13201', 'XG24 D&N', 24, 4, 32), ('13301', 'XXG22 SP', 22, 4, 36),
                ('13401', 'M34 SP', 34, 4, 30), ('14101', 'M34 Super Proteção', 34, 4, 30), ('14201', 'M18 Super Proteção', 18, 6, 36),
                ('21111', 'RG 20 PAD', 20, 6, 24), ('32321', 'G30 CR Pelé', 30, 4, 30), ('32131', 'XG26 CR Senna', 26, 4, 36)
            ]
            for s in skus_carga:
                cursor.execute("INSERT INTO master_sku (codigo_sku, descricao, fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet) VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING;", s)

        # 5. Códigos de Parada
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS codigos_parada (
                id SERIAL PRIMARY KEY, tipo_maquina VARCHAR(50) NOT NULL,
                numero VARCHAR(50) NOT NULL, problema VARCHAR(255) NOT NULL, UNIQUE(tipo_maquina, numero)
            );
        """)
        cursor.execute("SELECT COUNT(*) FROM codigos_parada;")
        if cursor.fetchone()[0] == 0:
            paradas_baby = [
                ('1', 'Problemas no triturador (mill) - Absorção'), ('2', 'Linha do Pulp - Absorção'), ('3', 'Alimentador de polímero - Absorção'),
                ('4', 'Esteira transportadora - Absorção'), ('5', 'Pattern drum - Absorção'), ('6', 'Linha do Core /Tissue - Absorção'),
                ('11', 'Linha Inner Film'), ('12', 'Linha Center Top'), ('13', 'Linha LSG NW'), ('25', 'LSG 1º Sailor'),
                ('40', 'Linha 2 dobras'), ('41', 'Sonic'), ('53', 'VH - Corte'), ('58', 'R Cutter - Corte'),
                ('61', 'Parte de trás geral Correia, polia'), ('65', 'Erro humano(trabalho operador)'), ('67', 'HMA Tank A - Cola'),
                ('89', 'Emenda do Pulp'), ('101', 'OPTIMA STACKER'), ('115', 'Esteira de embalagem'), ('120', 'Detector de metais'),
                ('124', 'Defeito no material (SAP)')
            ]
            for num, prob in paradas_baby:
                cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES ('baby_care', %s, %s) ON CONFLICT DO NOTHING;", (num, prob))

            paradas_adult = [
                ('1', 'Problemas no triturador (mill)'), ('2', 'Linha do Pulp'), ('6', 'Envolvimento do tissue na absorção'),
                ('7', 'Core press'), ('11', 'Linha do tissue'), ('12', 'Linha inner back film'), ('40', 'Sonic'),
                ('56', 'VH - Corte'), ('65', 'Erro Humano (operador)'), ('67', 'HMA TANK A'), ('83', 'Emenda Pulp'), 
                ('93', 'Optima Stacker')
            ]
            for num, prob in paradas_adult:
                cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES ('adult_care', %s, %s) ON CONFLICT DO NOTHING;", (num, prob))

        # 6. Tabelas de Apontamento
        cursor.execute("CREATE TABLE IF NOT EXISTS registro_turnos (id SERIAL PRIMARY KEY, data_registro DATE NOT NULL, turno INT NOT NULL, operador VARCHAR(255) NOT NULL, maquina_numero INT NOT NULL);")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS result_by_order (
                id SERIAL PRIMARY KEY, turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE,
                ordem VARCHAR(100) NOT NULL, codigo_sku VARCHAR(100) NOT NULL, horario_padrao INT NOT NULL,
                run_time INT NOT NULL, machine_counter INT NOT NULL, pallets INT NOT NULL, fardos_avulsos INT NOT NULL,
                tipo_tno VARCHAR(100), tempo_tno INT DEFAULT 0, total_pecas_estoque INT NOT NULL, taxa_movimentacao NUMERIC(5,2), taxa_loss NUMERIC(5,2)
            );
        """)
        cursor.execute("CREATE TABLE IF NOT EXISTS stop_machine_item (id SERIAL PRIMARY KEY, turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE, numero_parada VARCHAR(50) NOT NULL, minutos_parados INT NOT NULL);")
        
        conn.commit()
        cursor.close()
        conn.close()
        print("⚡ Infraestrutura Industrial Unicharm recriada com sucesso!")
    except Exception as e:
        print(f"❌ Erro na inicialização: {str(e)}")

inicializar_banco()

# ==========================================
# MODELOS DE ENTRADA (PYDANTIC)
# ==========================================
class ModelAuth(BaseModel): login: str; senha: str
class ModelUsuario(BaseModel): login: str; senha: str; nome: str; nivel: int
class ModelSKU(BaseModel): codigo_sku: str; descricao: str; fraldas_por_pacote: int; pacotes_por_fardo: int; fardos_por_pallet: int
class ModelMaquina(BaseModel): numero_maquina: int; tipo: str
class ModelParadaMestre(BaseModel): tipo_maquina: str; numero: str; problema: str
class ModelTNOMestre(BaseModel): nome: str

class OrdemProducao(BaseModel): ordem: str; codigo_sku: str; horario_padrao: int; run_time: int; machine_counter: int; pallets: int; fardos_avulsos: int; tipo_tno: str; tempo_tno: int
class ParadaTurno(BaseModel): numero_parada: str; minutos_parados: int
class PayloadApontamento(BaseModel): data_registro: str; turno: int; operador: str; maquina: int; ordens: List[OrdemProducao]; paradas: List[ParadaTurno]

# ==========================================
# ROTAS DA API
# ==========================================

@app.post("/usuarios/auth")
def autenticar(obj: ModelAuth):
    login = obj.login.strip().lower()
    if login == "admin" and obj.senha == "admin": return {"login": "admin", "nome": "Administrador Global", "nivel": 3}
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT login, nome, nivel FROM usuarios WHERE login = %s AND senha = %s;", (login, obj.senha))
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        if user: return user
    except Exception: pass
    raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")

@app.get("/dados-mestres")
def obter_dados_mestres():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM master_sku ORDER BY codigo_sku ASC;")
        skus = cursor.fetchall()
        cursor.execute("SELECT * FROM codigos_parada ORDER BY tipo_maquina, numero ASC;")
        paradas = cursor.fetchall()
        cursor.execute("SELECT * FROM tipos_tno ORDER BY nome ASC;")
        tnos = cursor.fetchall()
        cursor.execute("SELECT * FROM maquinas ORDER BY numero_maquina ASC;")
        maquinas = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"skus": skus, "paradas": paradas, "tnos": tnos, "maquinas": maquinas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/apontamentos")
def salvar_apontamento(dados: PayloadApontamento):
    cargas = {1: 455, 2: 440, 3: 415}
    tempo_turno = cargas.get(dados.turno, 440)

    soma_hp = sum(o.horario_padrao for o in dados.ordens)
    soma_rt = sum(o.run_time for o in dados.ordens)
    soma_tno = sum(o.tempo_tno for o in dados.ordens)
    soma_paradas = sum(p.minutos_parados for p in dados.paradas)

    if (soma_hp + soma_tno) != tempo_turno:
        raise HTTPException(status_code=400, detail=f"A soma do Horário Padrão + TNO resultou em {soma_hp + soma_tno}m. O esperado é {tempo_turno}m.")
    if (soma_hp - soma_rt) != soma_paradas:
        raise HTTPException(status_code=400, detail=f"Inconsistência: HP - Run Time resultou em {soma_hp - soma_rt}m, mas o total de paradas é {soma_paradas}m.")

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO registro_turnos (data_registro, turno, operador, maquina_numero) VALUES (%s, %s, %s, %s) RETURNING id;", (dados.data_registro, dados.turno, dados.operador, dados.maquina))
        turno_id = cursor.fetchone()[0]

        for o in dados.ordens:
            cursor.execute("SELECT fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet FROM master_sku WHERE codigo_sku = %s;", (o.codigo_sku,))
            sku = cursor.fetchone()
            fraldas, pacotes, fardos_pallet = sku if sku else (0, 0, 0)
            
            total_fardos = (o.pallets * fardos_pallet) + o.fardos_avulsos
            total_pecas = total_fardos * pacotes * fraldas
            taxa_mov = (o.run_time / o.horario_padrao * 100) if o.horario_padrao > 0 else 0
            taxa_loss = ((o.machine_counter - total_pecas) / o.machine_counter * 100) if o.machine_counter > 0 else 0

            cursor.execute("""
                INSERT INTO result_by_order (turno_id, ordem, codigo_sku, horario_padrao, run_time, machine_counter, pallets, fardos_avulsos, tipo_tno, tempo_tno, total_pecas_estoque, taxa_movimentacao, taxa_loss)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, (turno_id, o.ordem, o.codigo_sku, o.horario_padrao, o.run_time, o.machine_counter, o.pallets, o.fardos_avulsos, o.tipo_tno, o.tempo_tno, total_pecas, taxa_mov, taxa_loss))

        for p in dados.paradas:
            cursor.execute("INSERT INTO stop_machine_item (turno_id, numero_parada, minutos_parados) VALUES (%s, %s, %s);", (turno_id, p.numero_parada, p.minutos_parados))

        conn.commit()
        return {"status": "sucesso"}
    except Exception as e:
        if 'conn' in locals(): conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

# ROTAS DO ADMIN (CRUD)
@app.post("/admin/skus")
def adicionar_sku(s: ModelSKU):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO master_sku (codigo_sku, descricao, fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet) VALUES (%s, %s, %s, %s, %s);", 
                      (s.codigo_sku, s.descricao, s.fraldas_por_pacote, s.pacotes_por_fardo, s.fardos_por_pallet))
        conn.commit()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.post("/admin/maquinas")
def adicionar_maquina(m: ModelMaquina):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO maquinas (numero_maquina, tipo) VALUES (%s, %s);", (m.numero_maquina, m.tipo))
        conn.commit()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.post("/admin/tnos")
def adicionar_tno(t: ModelTNOMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO tipos_tno (nome) VALUES (%s);", (t.nome,))
        conn.commit()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.post("/admin/paradas")
def adicionar_codigo_parada_mestre(p: ModelParadaMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES (%s, %s, %s);", (p.tipo_maquina, p.numero, p.problema))
        conn.commit()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.post("/admin/usuarios")
def adicionar_usuario(u: ModelUsuario):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES (%s, %s, %s, %s);", (u.login, u.senha, u.nome, u.nivel))
        conn.commit()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.get("/historico-lancamentos")
def listar_historico():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT r.id, r.data_registro::text, r.turno, r.operador, r.maquina_numero, (SELECT COALESCE(SUM(machine_counter),0) FROM result_by_order WHERE turno_id = r.id) as total_mc FROM registro_turnos r ORDER BY r.data_registro DESC, r.turno ASC;")
        dados = cursor.fetchall()
        return dados
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.delete("/historico-lancamentos/{id}")
def deletar_lancamento(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM registro_turnos WHERE id = %s;", (id,))
        conn.commit()
        return {"status": "removido"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()
