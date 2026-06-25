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

# Seu banco Neon atual
DATABASE_URL = "postgresql://neondb_owner:npg_G9jBAgO0hpXr@ep-broad-sky-ate4cjbm.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require"

def inicializar_banco():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        
        # 1. Tabela de Usuários (Níveis 1, 2 e 3)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                login VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(100) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                nivel INT DEFAULT 1 -- 1: Operador, 2: Liderança, 3: Admin
            );
        """)

        # Criar admin padrão se não existir
        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO usuarios (login, senha, nome, nivel)
                VALUES ('admin', 'admin', 'Administrador Global', 3);
            """)

        # 2. Tabela Mestre de SKUs (Para conversão de pallets/fardos)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS master_sku (
                id SERIAL PRIMARY KEY,
                codigo_sku VARCHAR(100) UNIQUE NOT NULL,
                descricao VARCHAR(255),
                fardos_por_pallet INT NOT NULL,
                pecas_por_fardo INT NOT NULL
            );
        """)

        # 3. Tabela de Códigos de Parada
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS codigos_parada (
                id SERIAL PRIMARY KEY,
                maquina INT NOT NULL,
                numero VARCHAR(50) NOT NULL,
                problema VARCHAR(255) NOT NULL
            );
        """)

        # 4. Tabela de Apontamento Geral (Cabeçalho do Turno)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS registro_turnos (
                id SERIAL PRIMARY KEY,
                data_registro DATE NOT NULL,
                turno INT NOT NULL,
                operador VARCHAR(255) NOT NULL,
                maquina INT NOT NULL,
                tempo_nao_operacional INT DEFAULT 0
            );
        """)

        # 5. Tabela de Produção por Ordem (Result by order)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS result_by_order (
                id SERIAL PRIMARY KEY,
                turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE,
                ordem VARCHAR(100) NOT NULL,
                codigo_sku VARCHAR(100) NOT NULL,
                horario_padrao INT NOT NULL,
                run_time INT NOT NULL,
                machine_counter INT NOT NULL,
                pallets INT NOT NULL,
                fardos_avulsos INT NOT NULL,
                total_pecas INT NOT NULL,
                taxa_movimentacao NUMERIC(5,2),
                taxa_loss NUMERIC(5,2)
            );
        """)

        # 6. Tabela de Paradas (Stop machine item)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS stop_machine_item (
                id SERIAL PRIMARY KEY,
                turno_id INT REFERENCES registro_turnos(id) ON DELETE CASCADE,
                numero_parada VARCHAR(50) NOT NULL,
                minutos_parados INT NOT NULL
            );
        """)

        conn.commit()
        cursor.close()
        conn.close()
        print("⚡ Banco de Dados da Indústria estruturado com sucesso!")
    except Exception as e:
        print(f"❌ Erro ao estruturar banco: {str(e)}")

inicializar_banco()

# ==========================================
# MODELOS DE DADOS (PYDANTIC)
# ==========================================

class OrdemProducao(BaseModel):
    ordem: str
    codigo_sku: str
    horario_padrao: int
    run_time: int
    machine_counter: int
    pallets: int
    fardos_avulsos: int

class ParadaMaquina(BaseModel):
    numero_parada: str
    minutos_parados: int

class ApontamentoTurno(BaseModel):
    data_registro: str
    turno: int
    operador: str
    maquina: int
    tempo_nao_operacional: int
    ordens: List[OrdemProducao]
    paradas: List[ParadaMaquina]

# ==========================================
# ROTAS E LÓGICA DE NEGÓCIO
# ==========================================

@app.post("/apontamentos")
def salvar_apontamento(dados: ApontamentoTurno):
    # 1. Definir carga horária base por turno
    carga_horaria_turno = {1: 455, 2: 440, 3: 415}
    if dados.turno not in carga_horaria_turno:
        raise HTTPException(status_code=400, detail="Turno inválido. Escolha 1, 2 ou 3.")
    
    tempo_exigido = carga_horaria_turno[dados.turno]

    # 2. Somatórias para as travas
    soma_horario_padrao = sum(ordem.horario_padrao for ordem in dados.ordens)
    soma_run_time = sum(ordem.run_time for ordem in dados.ordens)
    soma_paradas = sum(parada.minutos_parados for parada in dados.paradas)

    # TRAVA 1: Horário Padrão Total + Tempo Não Operacional deve ser igual ao tempo do turno
    tempo_total_calculado = soma_horario_padrao + dados.tempo_nao_operacional
    if tempo_total_calculado != tempo_exigido:
        raise HTTPException(
            status_code=400, 
            detail=f"BLOQUEIO: A soma do Horário Padrão das ordens ({soma_horario_padrao}m) + Tempo Não Operacional ({dados.tempo_nao_operacional}m) resultou em {tempo_total_calculado}m. O esperado para o Turno {dados.turno} é {tempo_exigido}m."
        )

    # TRAVA 2: Horário Padrão Total - Run Time deve ser igual à soma das paradas
    tempo_parada_calculado = soma_horario_padrao - soma_run_time
    if tempo_parada_calculado != soma_paradas:
        raise HTTPException(
            status_code=400, 
            detail=f"BLOQUEIO: Inconsistência nas paradas. (Horário Padrão [{soma_horario_padrao}m] - Run Time [{soma_run_time}m] = {tempo_parada_calculado}m). Porém, o total de paradas apontadas é {soma_paradas}m."
        )

    # Se passou pelas travas, salva no banco
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        # Inserir Cabeçalho do Turno
        cursor.execute("""
            INSERT INTO registro_turnos (data_registro, turno, operador, maquina, tempo_nao_operacional)
            VALUES (%s, %s, %s, %s, %s) RETURNING id;
        """, (dados.data_registro, dados.turno, dados.operador, dados.maquina, dados.tempo_nao_operacional))
        
        turno_id = cursor.fetchone()[0]

        # Inserir Ordens de Produção (Com cálculos de Peças e Taxas)
        for ordem in dados.ordens:
            # Buscar dados do SKU para conversão
            cursor.execute("SELECT fardos_por_pallet, pecas_por_fardo FROM master_sku WHERE codigo_sku = %s;", (ordem.codigo_sku,))
            sku_info = cursor.fetchone()
            
            # Se não achar o SKU, assume valores padrão para não quebrar (ideal é ter todos cadastrados)
            fardos_por_pallet = sku_info[0] if sku_info else 0
            pecas_por_fardo = sku_info[1] if sku_info else 0

            # CÁLCULOS
            total_fardos = (ordem.pallets * fardos_por_pallet) + ordem.fardos_avulsos
            total_pecas = total_fardos * pecas_por_fardo

            taxa_mov = (ordem.run_time / ordem.horario_padrao) * 100 if ordem.horario_padrao > 0 else 0
            taxa_loss = ((ordem.machine_counter - total_pecas) / ordem.machine_counter) * 100 if ordem.machine_counter > 0 else 0

            cursor.execute("""
                INSERT INTO result_by_order (turno_id, ordem, codigo_sku, horario_padrao, run_time, machine_counter, pallets, fardos_avulsos, total_pecas, taxa_movimentacao, taxa_loss)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
            """, (turno_id, ordem.ordem, ordem.codigo_sku, ordem.horario_padrao, ordem.run_time, ordem.machine_counter, ordem.pallets, ordem.fardos_avulsos, total_pecas, taxa_mov, taxa_loss))

        # Inserir Paradas
        for parada in dados.paradas:
            cursor.execute("""
                INSERT INTO stop_machine_item (turno_id, numero_parada, minutos_parados)
                VALUES (%s, %s, %s);
            """, (turno_id, parada.numero_parada, parada.minutos_parados))

        conn.commit()
        cursor.close()
        conn.close()

        return {"status": "sucesso", "mensagem": "Apontamento salvo com sucesso!", "turno_id": turno_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar no banco: {str(e)}")
