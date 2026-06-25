from fastapi import FastAPI, HTTPException, Query
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
        
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_name='ordem_tno';")
        if not cursor.fetchone():
            cursor.execute("DROP TABLE IF EXISTS ordem_tno, result_by_order, stop_machine_item, registro_turnos, codigos_parada, master_sku, tipos_tno, maquinas CASCADE;")
            conn.commit()

        cursor.execute("CREATE TABLE IF NOT EXISTS usuarios (id SERIAL PRIMARY KEY, login VARCHAR(100) UNIQUE NOT NULL, senha VARCHAR(100) NOT NULL, nome VARCHAR(255) NOT NULL, nivel INT DEFAULT 1);")
        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES ('admin', 'admin', 'Administrador Global', 3);")

        cursor.execute("CREATE TABLE IF NOT EXISTS maquinas (id SERIAL PRIMARY KEY, numero_maquina INT UNIQUE NOT NULL, tipo VARCHAR(50) NOT NULL, ativo BOOLEAN DEFAULT TRUE);")
        cursor.execute("SELECT COUNT(*) FROM maquinas;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO maquinas (numero_maquina, tipo) VALUES (1, 'adult_care'), (2, 'baby_care'), (3, 'baby_care'), (4, 'baby_care'), (5, 'baby_care'), (6, 'baby_care'), (7, 'adult_care');")

        cursor.execute("CREATE TABLE IF NOT EXISTS tipos_tno (id SERIAL PRIMARY KEY, nome VARCHAR(100) UNIQUE NOT NULL);")
        cursor.execute("SELECT COUNT(*) FROM tipos_tno;")
        if cursor.fetchone()[0] == 0:
            tnos = ['Manutenção', 'Limpeza', 'Ajuste de Partida de Máquina', 'Troca de Tamanho de Máquina', 'Ajuste Após Troca de Tamanho Máquina', 'Troca de Optima', 'Troca de Dosetec', 'Checagem de Liberação do Operador', 'Parada Programada', 'Parada por Falta / Problema de MP', 'Liberação de Linha Qualidade', 'Amostragem (Sampling)', 'Segurança do Trabalho', 'Outros']
            for tno in tnos:
                cursor.execute("INSERT INTO tipos_tno (nome) VALUES (%s) ON CONFLICT DO NOTHING;", (tno,))

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

        cursor.execute("CREATE TABLE IF NOT EXISTS codigos_parada (id SERIAL PRIMARY KEY, tipo_maquina VARCHAR(50) NOT NULL, numero VARCHAR(50) NOT NULL, problema VARCHAR(255) NOT NULL, UNIQUE(tipo_maquina, numero));")
        cursor.execute("SELECT COUNT(*) FROM codigos_parada;")
        if cursor.fetchone()[0] == 0:
            paradas_baby = [('1', 'Problemas triturador'), ('2', 'Linha Pulp'), ('101', 'OPTIMA STACKER'), ('124', 'Defeito SAP')]
            paradas_adult = [('1', 'Problemas triturador'), ('2', 'Linha Pulp'), ('93', 'Optima Stacker')]
            for num, prob in paradas_baby: cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES ('baby_care', %s, %s) ON CONFLICT DO NOTHING;", (num, prob))
            for num, prob in paradas_adult: cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES ('adult_care', %s, %s) ON CONFLICT DO NOTHING;", (num, prob))

        cursor.execute("CREATE TABLE IF NOT EXISTS registro_turnos (id SERIAL PRIMARY KEY, data_registro DATE NOT NULL, turno INT NOT NULL, operador VARCHAR(255) NOT NULL, maquina_numero INT NOT NULL);")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS result_by_order (
                id SERIAL PRIMARY KEY, turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE,
                ordem VARCHAR(100) NOT NULL, codigo_sku VARCHAR(100) NOT NULL, horario_padrao INT NOT NULL,
                run_time INT NOT NULL, machine_counter INT NOT NULL, pallets INT NOT NULL, fardos_avulsos INT NOT NULL,
                total_pecas_estoque INT NOT NULL, taxa_movimentacao NUMERIC(5,2), taxa_loss NUMERIC(5,2)
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ordem_tno (
                id SERIAL PRIMARY KEY, ordem_id INT REFERENCES result_by_order(id) ON DELETE CASCADE,
                tipo_tno VARCHAR(100) NOT NULL, tempo_tno INT NOT NULL
            );
        """)
        cursor.execute("CREATE TABLE IF NOT EXISTS stop_machine_item (id SERIAL PRIMARY KEY, turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE, numero_parada VARCHAR(50) NOT NULL, minutos_parados INT NOT NULL);")
        
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e: print(f"Erro BD: {str(e)}")

inicializar_banco()

# ================= MODELOS PYDANTIC =================
class ModelAuth(BaseModel): login: str; senha: str
class ModelUsuario(BaseModel): login: str; senha: str; nome: str; nivel: int
class ModelSKU(BaseModel): codigo_sku: str; descricao: str; fraldas_por_pacote: int; pacotes_por_fardo: int; fardos_por_pallet: int
class ModelMaquina(BaseModel): numero_maquina: int; tipo: str; ativo: bool
class ModelParadaMestre(BaseModel): tipo_maquina: str; numero: str; problema: str
class ModelTNOMestre(BaseModel): nome: str

class TNOOrdem(BaseModel): tipo_tno: str; tempo_tno: int
class OrdemProducao(BaseModel): 
    ordem: str; codigo_sku: str; horario_padrao: int; run_time: int; machine_counter: int
    pallets: int; fardos_avulsos: int; tnos: List[TNOOrdem]
class ParadaTurno(BaseModel): numero_parada: str; minutos_parados: int
class PayloadApontamento(BaseModel): data_registro: str; turno: int; operador: str; maquina: int; ordens: List[OrdemProducao]; paradas: List[ParadaTurno]

# ================= ROTAS BÁSICAS =================
@app.post("/usuarios/auth")
def autenticar(obj: ModelAuth):
    login = obj.login.strip().lower()
    if login == "admin" and obj.senha == "admin": return {"login": "admin", "nome": "Administrador", "nivel": 3}
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT login, nome, nivel FROM usuarios WHERE login = %s AND senha = %s;", (login, obj.senha))
        user = cursor.fetchone()
        conn.close()
        if user: return user
    except Exception: pass
    raise HTTPException(status_code=401, detail="Usuário/Senha inválidos")

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
        cursor.execute("SELECT id, login, nome, nivel FROM usuarios WHERE login != 'admin' ORDER BY nome ASC;")
        usuarios = cursor.fetchall()
        conn.close()
        return {"skus": skus, "paradas": paradas, "tnos": tnos, "maquinas": maquinas, "usuarios": usuarios}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# ================= ROTAS DE APONTAMENTO =================
def processar_apontamento(dados: PayloadApontamento, cursor, turno_id=None):
    cargas = {1: 455, 2: 440, 3: 415}
    tempo_turno = cargas.get(dados.turno, 440)

    soma_hp = sum(o.horario_padrao for o in dados.ordens)
    soma_rt = sum(o.run_time for o in dados.ordens)
    soma_tno = sum(t.tempo_tno for o in dados.ordens for t in o.tnos)
    soma_paradas = sum(p.minutos_parados for p in dados.paradas)

    if (soma_hp + soma_tno) != tempo_turno:
        raise HTTPException(status_code=400, detail=f"Soma Horário Padrão ({soma_hp}m) + TNO Total ({soma_tno}m) deve ser exatamente {tempo_turno}m.")
    if (soma_hp - soma_rt) != soma_paradas:
        raise HTTPException(status_code=400, detail=f"Inconsistência: HP ({soma_hp}m) - Run Time ({soma_rt}m) deve ser igual às paradas ({soma_paradas}m).")

    if turno_id:
        cursor.execute("UPDATE registro_turnos SET data_registro=%s, turno=%s, operador=%s, maquina_numero=%s WHERE id=%s;", 
                      (dados.data_registro, dados.turno, dados.operador, dados.maquina, turno_id))
        cursor.execute("DELETE FROM result_by_order WHERE turno_id = %s;", (turno_id,))
        cursor.execute("DELETE FROM stop_machine_item WHERE turno_id = %s;", (turno_id,))
    else:
        cursor.execute("INSERT INTO registro_turnos (data_registro, turno, operador, maquina_numero) VALUES (%s, %s, %s, %s) RETURNING id;", 
                      (dados.data_registro, dados.turno, dados.operador, dados.maquina))
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
            INSERT INTO result_by_order (turno_id, ordem, codigo_sku, horario_padrao, run_time, machine_counter, pallets, fardos_avulsos, total_pecas_estoque, taxa_movimentacao, taxa_loss)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
        """, (turno_id, o.ordem, o.codigo_sku, o.horario_padrao, o.run_time, o.machine_counter, o.pallets, o.fardos_avulsos, total_pecas, taxa_mov, taxa_loss))
        ordem_id = cursor.fetchone()[0]

        for t in o.tnos:
            cursor.execute("INSERT INTO ordem_tno (ordem_id, tipo_tno, tempo_tno) VALUES (%s, %s, %s);", (ordem_id, t.tipo_tno, t.tempo_tno))

    for p in dados.paradas:
        cursor.execute("INSERT INTO stop_machine_item (turno_id, numero_parada, minutos_parados) VALUES (%s, %s, %s);", (turno_id, p.numero_parada, p.minutos_parados))

@app.post("/apontamentos")
def criar_apontamento(dados: PayloadApontamento):
    conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
    try:
        processar_apontamento(dados, cursor)
        conn.commit()
        return {"status": "sucesso"}
    except HTTPException as h: conn.rollback(); raise h
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: conn.close()

@app.put("/apontamentos/{id}")
def atualizar_apontamento(id: int, dados: PayloadApontamento):
    conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
    try:
        processar_apontamento(dados, cursor, turno_id=id)
        conn.commit()
        return {"status": "sucesso"}
    except HTTPException as h: conn.rollback(); raise h
    except Exception as e: conn.rollback(); raise HTTPException(status_code=500, detail=str(e))
    finally: conn.close()

@app.get("/apontamentos")
def listar_lancamentos(data: str = None, turno: str = None, maquina: str = None, ordem: str = None):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = "SELECT r.id, r.data_registro::text, r.turno, r.operador, r.maquina_numero, (SELECT COALESCE(SUM(machine_counter),0) FROM result_by_order WHERE turno_id = r.id) as total_mc FROM registro_turnos r WHERE 1=1 "
        params = []
        if data: query += "AND r.data_registro = %s "; params.append(data)
        if turno: query += "AND r.turno = %s "; params.append(turno)
        if maquina: query += "AND r.maquina_numero = %s "; params.append(maquina)
        if ordem: query += "AND EXISTS (SELECT 1 FROM result_by_order WHERE turno_id = r.id AND ordem ILIKE %s) "; params.append(f"%{ordem}%")
        
        query += "ORDER BY r.data_registro DESC, r.turno ASC LIMIT 150;"
        cursor.execute(query, tuple(params))
        dados = cursor.fetchall()
        conn.close()
        return dados
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/apontamentos/{id}")
def obter_lancamento_completo(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT id, data_registro::text, turno, operador, maquina_numero as maquina FROM registro_turnos WHERE id = %s;", (id,))
        turno = cursor.fetchone()
        if not turno: raise HTTPException(status_code=404)

        cursor.execute("SELECT id, ordem, codigo_sku, horario_padrao, run_time, machine_counter, pallets, fardos_avulsos FROM result_by_order WHERE turno_id = %s;", (id,))
        ordens = cursor.fetchall()
        for o in ordens:
            cursor.execute("SELECT tipo_tno, tempo_tno FROM ordem_tno WHERE ordem_id = %s;", (o['id'],))
            o['tnos'] = cursor.fetchall()

        cursor.execute("SELECT numero_parada, minutos_parados FROM stop_machine_item WHERE turno_id = %s;", (id,))
        paradas = cursor.fetchall()

        turno['ordens'] = ordens
        turno['paradas'] = paradas
        conn.close()
        return turno
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/apontamentos/{id}")
def deletar_lancamento(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("DELETE FROM registro_turnos WHERE id = %s;", (id,))
        conn.commit(); conn.close()
        return {"status": "removido"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/visao-ordens")
def visao_ordens():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT ro.ordem, MAX(rt.maquina_numero) as maquina, ro.codigo_sku, 
            SUM(ro.machine_counter) as total_mc, SUM(ro.total_pecas_estoque) as pecas_estoque, 
            SUM(ro.horario_padrao) as hp_total, SUM(ro.run_time) as rt_total, 
            SUM(ro.pallets) as pallets, SUM(ro.fardos_avulsos) as fardos_avulsos,
            MAX(s.fardos_por_pallet) as fat_pallet
            FROM result_by_order ro
            JOIN registro_turnos rt ON ro.turno_id = rt.id
            JOIN master_sku s ON ro.codigo_sku = s.codigo_sku
            GROUP BY ro.ordem, ro.codigo_sku ORDER BY ro.ordem DESC LIMIT 100;
        """
        cursor.execute(query)
        linhas = cursor.fetchall()
        for l in linhas:
            l['total_fardos_calculado'] = (l['pallets'] * l['fat_pallet']) + l['fardos_avulsos']
        conn.close()
        return linhas
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

# ================= ROTAS DE EDIÇÃO MASTER =================
@app.put("/admin/maquinas/{id}")
def editar_maquina(id: int, m: ModelMaquina):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("UPDATE maquinas SET numero_maquina=%s, tipo=%s, ativo=%s WHERE id=%s;", (m.numero_maquina, m.tipo, m.ativo, id))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/admin/tnos/{id}")
def editar_tno(id: int, t: ModelTNOMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("UPDATE tipos_tno SET nome=%s WHERE id=%s;", (t.nome, id))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/admin/tnos/{id}")
def deletar_tno(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("DELETE FROM tipos_tno WHERE id=%s;", (id,))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/admin/paradas/{id}")
def editar_parada(id: int, p: ModelParadaMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("UPDATE codigos_parada SET tipo_maquina=%s, numero=%s, problema=%s WHERE id=%s;", (p.tipo_maquina, p.numero, p.problema, id))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/admin/paradas/{id}")
def deletar_parada(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("DELETE FROM codigos_parada WHERE id=%s;", (id,))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/admin/usuarios/{id}")
def editar_usuario(id: int, u: ModelUsuario):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("UPDATE usuarios SET login=%s, senha=%s, nome=%s, nivel=%s WHERE id=%s;", (u.login.lower(), u.senha, u.nome, u.nivel, id))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/admin/usuarios/{id}")
def deletar_usuario(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("DELETE FROM usuarios WHERE id=%s;", (id,))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/skus")
def adicionar_sku(s: ModelSKU):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("INSERT INTO master_sku (codigo_sku, descricao, fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet) VALUES (%s, %s, %s, %s, %s);", 
                      (s.codigo_sku, s.descricao, s.fraldas_por_pacote, s.pacotes_por_fardo, s.fardos_por_pallet))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.put("/skus/{id}")
def modificar_sku(id: int, s: ModelSKU):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("UPDATE master_sku SET codigo_sku=%s, descricao=%s, fraldas_por_pacote=%s, pacotes_por_fardo=%s, fardos_por_pallet=%s WHERE id=%s;", (s.codigo_sku, s.descricao, s.fraldas_por_pacote, s.pacotes_por_fardo, s.fardos_por_pallet, id))
        conn.commit(); conn.close()
        return {"status": "atualizado"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.delete("/skus/{id}")
def deletar_sku(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("DELETE FROM master_sku WHERE id = %s;", (id,))
        conn.commit(); conn.close()
        return {"status": "removido"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/maquinas")
def adicionar_maquina(m: ModelMaquina):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("INSERT INTO maquinas (numero_maquina, tipo, ativo) VALUES (%s, %s, %s);", (m.numero_maquina, m.tipo, m.ativo))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/tnos")
def adicionar_tno(t: ModelTNOMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("INSERT INTO tipos_tno (nome) VALUES (%s);", (t.nome,))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/paradas")
def adicionar_codigo_parada_mestre(p: ModelParadaMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES (%s, %s, %s);", (p.tipo_maquina, p.numero, p.problema))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/usuarios")
def adicionar_usuario(u: ModelUsuario):
    try:
        conn = psycopg2.connect(DATABASE_URL); cursor = conn.cursor()
        cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES (%s, %s, %s, %s);", (u.login, u.senha, u.nome, u.nivel))
        conn.commit(); conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
