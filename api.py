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
        
        # 1. Tabela de Usuários
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                login VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(100) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                nivel INT DEFAULT 1
            );
        """)

        cursor.execute("SELECT id FROM usuarios WHERE login = 'admin';")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES ('admin', 'admin', 'Administrador Global', 3);")

        # 2. Tabela de Máquinas
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS maquinas (
                id SERIAL PRIMARY KEY,
                numero_maquina INT UNIQUE NOT NULL,
                tipo VARCHAR(50) NOT NULL
            );
        """)

        cursor.execute("SELECT COUNT(*) FROM maquinas;")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO maquinas (numero_maquina, tipo) VALUES 
                (1, 'adult_care'), (2, 'baby_care'), (3, 'baby_care'), 
                (4, 'baby_care'), (5, 'baby_care'), (6, 'baby_care'), (7, 'adult_care');
            """)

        # 3. Tabela de Tipos de TNO
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tipos_tno (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) UNIQUE NOT NULL
            );
        """)

        cursor.execute("SELECT COUNT(*) FROM tipos_tno;")
        if cursor.fetchone()[0] == 0:
            tnos = [
                'Manutenção', 'Limpeza', 'Ajuste de Partida de Máquina', 
                'Troca de Tamanho de Máquina', 'Ajuste Após Troca de Tamanho Máquina', 
                'Troca de Optima', 'Troca de Dosetec', 'Checagem de Liberação do Operador', 
                'Parada Programada', 'Parada por Falta / Problema de MP', 
                'Liberação de Linha Qualidade', 'Amostragem (Sampling)', 
                'Segurança do Trabalho', 'Outros'
            ]
            for tno in tnos:
                cursor.execute("INSERT INTO tipos_tno (nome) VALUES (%s) ON CONFLICT DO NOTHING;", (tno,))

        # 4. Tabela Mestre de SKUs (Catálogo Completo Unicharm)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS master_sku (
                id SERIAL PRIMARY KEY,
                codigo_sku VARCHAR(100) UNIQUE NOT NULL,
                descricao VARCHAR(255),
                fraldas_por_pacote INT NOT NULL,
                pacotes_por_fardo INT NOT NULL,
                fardos_por_pallet INT NOT NULL
            );
        """)

        cursor.execute("SELECT COUNT(*) FROM master_sku;")
        if cursor.fetchone()[0] == 0:
            skus_carga = [
                ('1000', 'RN-TESTE', 4, 63, 18), ('2000', 'P-TESTE', 4, 48, 18),
                ('3000', 'M-TESTE', 1, 120, 18), ('4000', 'G-TESTE', 1, 120, 18),
                ('5000', 'XG-TESTE', 1, 100, 18), ('6000', 'XXG-TESTE', 1, 100, 18),
                ('7000', 'P/M LIFREE TESTE', 1, 1, 1), ('8000', 'G/XG LIFREE TESTE', 1, 1, 1),
                ('7801084', 'P50', 50, 4, 25), ('7801000', 'M20', 20, 6, 30),
                ('7801087', 'M58', 58, 4, 15), ('7801130', 'M34', 34, 4, 30),
                ('7801133', 'M1', 1, 60, 36), ('7801138', 'M68', 68, 2, 33),
                ('7801001', 'G17', 17, 6, 36), ('7801088', 'G50', 50, 4, 20),
                ('7801093', 'G64', 32, 4, 27), ('7801131', 'G30', 30, 4, 30),
                ('7801134', 'G1', 1, 60, 36), ('7801139', 'G60', 60, 2, 33),
                ('7801002', 'XG15', 15, 6, 36), ('7801072', 'XG28', 28, 4, 30),
                ('7801089', 'XG42', 42, 4, 16), ('7801095', 'XG56', 28, 4, 27),
                ('7801132', 'XG26', 26, 4, 28), ('7801140', 'XG52', 52, 2, 32),
                ('8010020', 'P24', 24, 6, 24), ('7801017', 'P24', 24, 6, 24),
                ('7801091', 'P46', 46, 4, 25), ('7801108', 'P34', 34, 6, 18),
                ('7801049', 'XXG13', 13, 6, 32), ('7801073', 'XXG24', 24, 4, 28),
                ('7801090', 'XXG36', 36, 4, 20), ('7801141', 'XXG44', 44, 2, 36),
                ('7801053', 'M18', 18, 6, 36), ('7801074', 'M34', 34, 4, 30),
                ('8010041', 'G1 CR', 1, 60, 36), ('7801114', 'M26', 26, 6, 144),
                ('7801135', 'M1', 1, 60, 36), ('7801142', 'M68', 68, 2, 33),
                ('7801149', 'M40', 40, 4, 25), ('7801054', 'G16', 16, 6, 30),
                ('7801075', 'G30', 30, 4, 30), ('7801081', 'G50', 50, 4, 20),
                ('7801136', 'G1', 1, 60, 36), ('7801143', 'G60', 60, 2, 33),
                ('7801055', 'XG14', 14, 6, 36), ('7801076', 'XG26', 26, 4, 28),
                ('7801082', 'XG42', 42, 4, 16), ('7801144', 'XG52', 52, 2, 32),
                ('7801067', 'XXG12', 12, 6, 32), ('7801077', 'XXG22', 22, 4, 28),
                ('7801083', 'XXG36', 36, 4, 20), ('7801145', 'XXG44', 44, 2, 36),
                ('7801078', 'P22', 22, 6, 30), ('7801079', 'P46', 46, 4, 25),
                ('7801113', 'P34', 34, 6, 18), ('7801118', 'RN20', 20, 6, 30),
                ('7801119', 'RN36', 36, 4, 30), ('7801146', 'G28', 28, 4, 32),
                ('7801147', 'XG24', 24, 4, 32), ('7801148', 'XXG22 SP', 22, 4, 36),
                ('7801150', 'M34 SP', 34, 4, 30), ('7801152', 'M34', 34, 4, 30),
                ('7801151', 'M18', 18, 6, 36), ('7801153', 'M58', 58, 4, 20),
                ('7801154', 'M68', 68, 2, 33), ('7900016', 'RG 20', 20, 6, 24),
                ('7900017', 'RG02 - HC', 2, 60, 24), ('8010028', 'G30 CR', 30, 4, 30),
                ('8010029', 'XG26 CR', 26, 4, 36), ('8010030', 'XXG 24 CR', 24, 4, 32),
                ('8010009', 'XG26 D&N', 26, 4, 8, 32), ('8010037', 'GG XG52 CR', 52, 2, 36),
                ('8010038', 'GG XXG44 CR', 44, 2, 36), ('8010039', 'AMOSTRA M1', 1, 60, 36),
                ('8010008', 'G30 Senna', 30, 4, 30), ('8010035', 'GG M68 CR', 68, 2, 33),
                ('8010003', 'XG14 Sena', 14, 6, 36), ('8010007', 'M34 Senna', 34, 4, 30),
                ('8010036', 'G60 CR', 60, 2, 33), ('8010026', 'P46 CR', 46, 4, 25),
                ('8010025', 'RN36 CR', 36, 4, 30), ('8010040', 'AMOSTRA', 1, 60, 36),
                ('8010005', 'P46 Senna', 46, 4, 25), ('8010027', 'JB M34 CR', 34, 4, 30),
                ('8010016', 'G60 Senna', 60, 2, 33), ('8010015', 'M68 Senna', 68, 2, 33),
                ('8010014', 'XXG36 Senna', 36, 4, 20), ('8010018', 'XXG44 Senna', 44, 2, 36),
                ('8010023', 'XG15 CR', 15, 6, 36), ('8010021', 'M20 CR', 20, 6, 30),
                ('8010000', 'P22 Senna', 22, 6, 30), ('8010017', 'XG52 D&N', 52, 2, 36),
                ('8010001', 'M18 Senna', 18, 6, 36), ('8010013', 'XG42 Senna', 42, 4, 16),
                ('8010002', 'G16 Senna', 16, 6, 30), ('8010019', 'RN20 CR', 20, 6, 30),
                ('8010033', 'XG42 CR', 42, 4, 16), ('8010004', 'XXG12 Senna', 12, 6, 32),
                ('8010012', 'G50 Senna', 50, 4, 20), ('8010011', 'M58 Senna', 58, 4, 15),
                ('8010031', 'M58 CR', 58, 4, 15), ('8010032', 'G50 CR', 50, 4, 15),
                ('8010022', 'G17 CR', 17, 6, 36), ('8010034', 'XXG36 CR', 36, 4, 20),
                ('8010024', 'XXG13 CR', 13, 6, 32), ('8010042', 'M1', 1, 60, 36),
                ('8010043', 'G1', 1, 60, 36), ('8010010', 'XXG22 SENNA', 22, 4, 32),
                ('8010006', 'M40 Senna', 40, 4, 25), ('8110011', 'M58 Senna Exp', 58, 4, 20),
                ('8010044', 'Amostra M Senna', 1, 60, 36), ('8900009', 'EA HIP G/XG24X2', 24, 2, 24),
                ('8900003', 'SC HIP G/XG24X2', 24, 2, 24), ('8900002', 'SC JB G/XG16X4', 16, 4, 18),
                ('8110030', 'XXG24 CR Exp', 24, 4, 32), ('8900010', 'EA P/M 9', 9, 6, 24),
                ('8900004', 'SC P/M 9', 9, 6, 24), ('8110020', 'P24 CR Exp', 24, 6, 24),
                ('8110034', 'XXG36 CR Exp', 36, 4, 20), ('8900001', 'SC G/XG 9', 9, 6, 24),
                ('8900007', 'EA G/XG 9', 9, 6, 24), ('8900008', 'EA G/XG 16', 16, 4, 18),
                ('8010046', 'XXXG18', 18, 4, 40), ('8010051', 'M54 SP', 54, 4, 20),
                ('8010055', 'XG24SP', 24, 4, 32), ('8010047', 'XXXG36 D&N', 36, 2, 40),
                ('8010052', 'G/XG Amostra', 1, 45, 25), ('8900006', 'SC HIP P/M24X2', 24, 2, 24),
                ('8900012', 'EA P/M 24', 24, 2, 36), ('8010054', 'M34 SP', 34, 4, 30),
                ('8010053', 'G28 SP', 28, 4, 32), ('8010056', 'XXG22', 22, 4, 36),
                ('8010048', 'XXG36 SP', 36, 4, 20), ('8010049', 'XG42 SP', 42, 4, 20),
                ('8010050', 'G46 SP', 46, 4, 25), ('8010057', 'AG EA P/M', 1, 45, 25),
                ('8110089', 'AMOSTRA XG26', 26, 4, 32), ('8110005', 'P46 D&N Exp', 46, 4, 25),
                ('8110037', 'XG52 CR Exp', 52, 2, 36), ('8110003', 'XG14 D&N Exp', 14, 6, 36),
                ('8010045', 'AMOSTRA M CR', 1, 60, 36), ('8110007', 'M34 JB exp', 34, 4, 30),
                ('8110013', 'XG42 expo', 42, 4, 16), ('8110054', 'M34 jb expo', 34, 4, 30),
                ('8110056', 'XXG22 SP Import', 22, 4, 36), ('8110055', 'XG24 SP Import', 24, 4, 32),
                ('8110008', 'G30 D&N Import', 30, 4, 30)
            ]
            for s in skus_carga:
                cursor.execute("""
                    INSERT INTO master_sku (codigo_sku, descricao, fraldas_por_pacote, pacotes_por_fardo, fardos_por_pallet) 
                    VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING;
                """, s)

        # 5. Tabela de Códigos de Parada (Baby Care e Geriátrico)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS codigos_parada (
                id SERIAL PRIMARY KEY,
                tipo_maquina VARCHAR(50) NOT NULL, -- 'baby_care' ou 'adult_care'
                numero VARCHAR(50) NOT NULL,
                problema VARCHAR(255) NOT NULL,
                UNIQUE(tipo_maquina, numero)
            );
        """)

        cursor.execute("SELECT COUNT(*) FROM codigos_parada;")
        if cursor.fetchone()[0] == 0:
            # Baby Care (Mqs 2 a 6)
            paradas_baby = [
                ('1', 'Problemas no triturador (mill)'), ('2', 'Linha do Pulp'), ('3', 'Alimentador de polímero'),
                ('4', 'Esteira transportadora'), ('5', 'Pattern drum'), ('6', 'Linha do Core /Tissue'),
                ('7', 'Envolvimento do Core Wrap/Tissue na absorção'), ('8', 'Core Press'), ('9', 'Core Cutter'),
                ('10', 'Outros problemas'), ('11', 'Linha Inner Film'), ('12', 'Linha Center Top'),
                ('13', 'Linha LSG NW'), ('14', 'Linha LG1 Lycra'), ('15', 'Linha LG2 Lycra'),
                ('16', 'Linha LSG Lycra'), ('17', 'Linha WG OP lado'), ('18', 'Linha FG OP lado'),
                ('19', 'Linha WG DR lado'), ('20', 'Linha FG DR lado'), ('21', 'Linha Outer Back NW'),
                ('22', 'Linha Print Film'), ('23', 'Linha Side Top'), ('24', 'Linha Disposal Tape'),
                ('25', 'LSG 1º Sailor'), ('26', 'LG-2 Confluência'), ('27', 'Envolvimento do Center Top'),
                ('28', 'Sailor de Envolvimento do Center Top'), ('29', 'LG-1 Confluência no Sailor'),
                ('30', 'Inner End Press'), ('31', 'Esteira antes da confluência no VH'),
                ('32', 'Sailor de Dobramento do WG (N/A : MQ 2,3,5,6)'), ('33', 'Breeze Hole ( N/A : MQ 4)'),
                ('34', 'Outerback Press Roll'), ('35', 'Dobramento WG Waist Fold (N/A: MQ04)'),
                ('36', 'Outer Back Slitter'), ('37', 'Bonding Roll'), ('38', 'Inner Outer Press Roll'),
                ('39', 'Linha de Transporte depois do R Cutter'), ('40', 'Linha 2 dobras'), ('41', 'Sonic'),
                ('42', 'Na entrega da linha para TU'), ('43', 'Linha de Transporte entre Sonic e TU'),
                ('44', 'Linha de transporte depois do TU'), ('45', 'Saída da 1ª Rejeição'),
                ('46', 'Optima distribuição Shooter'), ('47', 'Crank (empurrador) para Calha'),
                ('48', 'Esteiras depois da 1ª saída da rejection'), ('49', '2ª saída de rejeição'),
                ('50', 'Problema no HAW'), ('51', 'Problema na câmera detectora'), ('52', 'Outras partes do processo'),
                ('53', 'VH'), ('54', 'Print Film Cutter'), ('55', 'FG Cutter lado OP'), ('56', 'FG Cutter lado DR'),
                ('57', 'Disposal Tape'), ('58', 'R Cutter'), ('59', 'Entupimento do R Cutter Trim'), ('60', 'TU'),
                ('61', 'Parte de trás geral Correia, polia'), ('62', 'Problemas do Fan'), ('63', 'Problemas da parte elétrica'),
                ('64', 'Outros problemas'), ('65', 'Erro humano(trabalho operador)'), ('66', 'Erro humano(trabalho de abastecim.)'),
                ('67', 'HMA Tank A'), ('68', 'HMA Tank B'), ('69', 'HMA Tank C'), ('70', 'HMA Tank D'),
                ('71', 'Core Wrap HMA'), ('72', 'Center Top SP HMA'), ('73', 'Inner Film HMA'), ('74', 'LSG Fold HMA'),
                ('75', 'Core Fix HMA'), ('76', 'LSG STD&End HMA'), ('77', 'LSG End HMA'), ('78', 'I/O(Inner) HMA'),
                ('79', 'I/O(Outer) HMA'), ('80', 'Outer Back HMA (N/A : MQ 2,3,5,6)'), ('81', 'Print Film HMA'),
                ('82', 'LSG Slit HMA'), ('83', 'LG-1 Slit HMA'), ('84', 'LG-2 Slit HMA'), ('85', 'WG Slit HMA'),
                ('86', 'FG Slit HMA'), ('87', 'Side Top Coater HMA (N/A : MQ 4)'), ('88', 'Waist Fold Coater HMA (N/A : MQ 4)'),
                ('89', 'Emenda do Pulp'), ('90', 'Emenda do Core Wrap'), ('91', 'Emenda do Inner Film'),
                ('92', 'Emenda do Center Top'), ('93', 'Emenda do LSG NW'), ('94', 'Emenda do LG/LSG Spandex'),
                ('95', 'Emenda do WG/FG Spandex'), ('96', 'Emenda do Inner end Cover'), ('97', 'Emenda do Outer Back NW'),
                ('98', 'Emenda do Print Film'), ('99', 'Emenda do Side Top'), ('100', 'Emenda do Disposal Tape'),
                ('101', 'OPTIMA STACKER'), ('102', 'OPTIMA Pré Compressão'), ('103', 'OPTIMA Turning Station'),
                ('104', 'OPTIMA Bar Conveyor'), ('105', 'OPTMA Bag Infeed'), ('106', 'OPTIMA Overhead Conveyor'),
                ('107', 'OPTIMA Compressão 25Kn'), ('108', 'OPTIMA Active Funnel'), ('109', 'OPTIMA Shuttle'),
                ('110', 'OPTIMA Bag Pickup'), ('111', 'OPTIMA Welding Station'), ('112', 'OPTIMA Side Folder'),
                ('113', 'Embalagem Manual'), ('114', 'Outros problemas'), ('115', 'Esteira de embalagem'),
                ('116', 'Mesa de embalagem'), ('117', 'Envolvedora'), ('118', 'Dosetec'), ('119', 'Ink-Jet'),
                ('120', 'Detector de metais'), ('121', 'Balança de Rejeição'), ('122', 'Outros problemas'),
                ('123', 'Recuperação'), ('124', 'Defeito no material (SAP)'), ('125', 'Defeito no material (PULP)'),
                ('126', 'Defeito no material (CORE WRAP)'), ('127', 'Defeito no material (INNER FILM)'),
                ('128', 'Defeito no material (CENTER TOP)'), ('129', 'Defeito no material (LSG)'),
                ('130', 'Defeito no material (OUTERBACK)'), ('131', 'Defeito no material (PRINT FILM)'),
                ('132', 'Defeito no material (SIDE TEP)'), ('133', 'Defeito no material (DISPOSAL TAPE)'),
                ('134', 'Defeito no material (LYCRA)'), ('135', 'Defeito no material (POLYBAG)')
            ]
            for num, prob in paradas_baby:
                cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES ('baby_care', %s, %s) ON CONFLICT DO NOTHING;", (num, prob))

            # Adult Care (Mqs 1 e 7)
            paradas_adult = [
                ('1', 'Problemas no triturador (mill)'), ('2', 'Linha do Pulp'), ('3', 'Alimentador de polímero'),
                ('4', 'Esteira transportadora'), ('5', 'Pattern drum'), ('6', 'Envolvimento do tissue na absorção'),
                ('7', 'Core press'), ('8', 'Diamond emboss'), ('9', 'Mat cutter'), ('10', 'Outros problemas'),
                ('11', 'Linha do tissue'), ('12', 'Linha inner back film'), ('13', 'Linha inner top'),
                ('14', 'Linha LSG nw'), ('15', 'Lina LSG 1'), ('16', 'Linha LSG 2'), ('17', 'Linha center gather'),
                ('18', 'Linha WG lado OP'), ('19', 'Linha FG lado OP'), ('20', 'Linha LG lado OP'),
                ('21', 'Linha WG lado DR'), ('22', 'Linha FG lado DR'), ('23', 'Linha LG lado DR'),
                ('24', 'Linha cover NW'), ('25', 'Linha outer top NW'), ('26', 'Linha outer back NW'),
                ('27', 'Envolvimento do inner top'), ('28', 'LSG sliter'), ('29', 'LSG sailor'), ('30', 'LSG 2 sailor'),
                ('31', 'END SIDE SEAL PRESS'), ('32', 'Esteira antes da confluência do VH'), ('33', 'Outer back sliter'),
                ('34', 'Outer sonic'), ('35', 'Dobramento waist folding'), ('36', 'Bonding Roll'),
                ('37', 'Cover nw sliter'), ('38', 'Linha de transporte depois do cover line'), ('39', 'Linha 2 dobras'),
                ('40', 'Sonic'), ('41', 'Na entrega da linha para TU'), ('42', 'Linha de transporte entre sonic e TU'),
                ('43', 'Saída da 1° rejeição'), ('44', 'linha de transporte para o EAR Folding'),
                ('45', 'dobramento do EAR Folding'), ('46', 'Dobramento Impeller'), ('47', 'linha de trasnporte depois do Impeller'),
                ('48', 'Optima distribuição shooter'), ('49', 'Linha transportadora para crank'),
                ('50', 'Crank empurrador para calha'), ('51', 'Linha de transporte para optima'),
                ('52', '2° saida da rejeição'), ('53', 'Problema no HAW'), ('54', 'Problema na camêra detectora'),
                ('55', 'Outras partes do processo'), ('56', 'VH'), ('57', 'FG CUTTER P/M'), ('58', 'FG CUTTER G/XG'),
                ('59', 'R-CUTTER'), ('60', 'Entupimento do R-cutter trim'), ('61', 'Parte de trás geral correia, polia'),
                ('62', 'Problemas do fan'), ('63', 'Problemas parte eletrica'), ('64', 'Outros problemas'),
                ('65', 'Erro Humano (operador)'), ('66', 'Erro Humano (Abastecimento)'), ('67', 'HMA TANK A'),
                ('68', 'HMA TANK B'), ('69', 'HMA TANK C'), ('70', 'HMA TANK D'), ('71', 'Tissue NB HMA'),
                ('72', 'Inner top NB HMA'), ('73', 'LSG fixing NB HMA'), ('74', 'LSG NW Inner back HMA'),
                ('75', 'Center Gather SLIT HMA'), ('76', 'Crotch Gather HMA'), ('77', 'LSG1 Slit HMA'),
                ('78', 'LSG2 Slit HMA'), ('79', 'Cover HMA'), ('80', 'I/O NB HMA'), ('81', 'Waist Fold coater HMA'),
                ('82', 'LSG END/STANDING'), ('83', 'Emenda Pulp'), ('84', 'Emenda TISSUE'), ('85', 'Emenda Inner Back Film'),
                ('86', 'Emenda Inner top'), ('87', 'Emenda LSG'), ('88', 'Emenda LSG Spandex'), ('89', 'Emenda wg/fg/lg'),
                ('90', 'Emenda Cover NW'), ('91', 'Emenda Outer Back'), ('92', 'Emenda Outer top'),
                ('93', 'Optima Stacker'), ('94', 'Optima Pré comprenssão'), ('95', 'Optima turning station'),
                ('96', 'Optima Grouping table'), ('97', 'Optima Bag infeed'), ('98', 'Optima linear pusher'),
                ('99', 'Optima Compressão 25KN'), ('100', 'Optima shuttle'), ('101', 'Optima Bag pickup'),
                ('102', 'Optima welding station (selagem)'), ('103', 'Optima side folder'), ('104', 'Embalagem manual'),
                ('105', 'Outros Problemas'), ('106', 'Esteira de embalagem'), ('107', 'Mesa de embalagem'),
                ('108', 'Envolvedora'), ('109', 'Dosetec'), ('110', 'INK-JET'), ('111', 'Detector de metais'),
                ('112', 'Balança de rejeição'), ('113', 'outros Problemas'), ('114', 'Recuperação'),
                ('115', 'Sap'), ('116', 'Pulp'), ('117', 'Tissue'), ('118', 'Inner top'), ('119', 'Inner back film'),
                ('120', 'LSG NW'), ('121', 'Outer back NW'), ('122', 'Outer top NW'), ('123', 'Cover NW'),
                ('124', 'Lycra/Roica'), ('125', 'Polybag')
            ]
            for num, prob in paradas_adult:
                cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES ('adult_care', %s, %s) ON CONFLICT DO NOTHING;", (num, prob))

        # 6. Tabela de Cabeçalho do Turno
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS registro_turnos (
                id SERIAL PRIMARY KEY,
                data_registro DATE NOT NULL,
                turno INT NOT NULL,
                operador VARCHAR(255) NOT NULL,
                maquina_numero INT NOT NULL
            );
        """)

        # 7. Tabela de Ordens
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
                tipo_tno VARCHAR(100),
                tempo_tno INT DEFAULT 0,
                total_pecas_estoque INT NOT NULL,
                taxa_movimentacao NUMERIC(5,2),
                taxa_loss NUMERIC(5,2)
            );
        """)

        # 8. Tabela de Eventos de Parada
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
        print("⚡ Infraestrutura Industrial Unicharm pronta no Neon!")
    except Exception as e:
        print(f"❌ Erro na inicialização: {str(e)}")

inicializar_banco()

# ==========================================
# MODELOS DE ENTRADA (PYDANTIC)
# ==========================================

class ModelAuth(BaseModel):
    login: str
    senha: str

class ModelUsuario(BaseModel):
    login: str
    senha: str
    nome: str
    nivel: int

class ModelSKU(BaseModel):
    codigo_sku: str
    descricao: str
    fraldas_por_pacote: int
    pacotes_por_fardo: int
    fardos_por_pallet: int

class ModelParadaMestre(BaseModel):
    tipo_maquina: str
    numero: str
    problema: str

class ModelTNOMestre(BaseModel):
    nome: str

class OrdemProducao(BaseModel):
    ordem: str
    codigo_sku: str
    horario_padrao: int
    run_time: int
    machine_counter: int
    pallets: int
    fardos_avulsos: int
    tipo_tno: str
    tempo_tno: int

class ParadaTurno(BaseModel):
    numero_parada: str
    minutos_parados: int

class PayloadApontamento(BaseModel):
    data_registro: str
    turno: int
    operador: str
    maquina: int
    ordens: List[OrdemProducao]
    paradas: List[ParadaTurno]

# ==========================================
# ENDPOINTS OPERACIONAIS E GERENCIAIS
# ==========================================

@app.post("/usuarios/auth")
def autenticar(obj: ModelAuth):
    login = obj.login.strip().lower()
    if login == "admin" and obj.senha == "admin":
        return {"login": "admin", "nome": "Administrador Global", "nivel": 3}
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
        raise HTTPException(status_code=400, detail=f"Bloqueio: Soma Horário Padrão ({soma_hp}m) + TNO ({soma_tno}m) deve ser exatamente {tempo_turno}m.")

    if (soma_hp - soma_rt) != soma_paradas:
        raise HTTPException(status_code=400, detail=f"Bloqueio: Inconsistência. HP ({soma_hp}m) - Run Time ({soma_rt}m) deve ser igual às paradas apontadas ({soma_paradas}m).")

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO registro_turnos (data_registro, turno, operador, maquina_numero)
            VALUES (%s, %s, %s, %s) RETURNING id;
        """, (dados.data_registro, dados.turno, dados.operador, dados.maquina))
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
            cursor.execute("INSERT INTO stop_machine_item (turno_id, numero_parada, minutes_parados) VALUES (%s, %s, %s);", (turno_id, p.numero_parada, p.minutos_parados))

        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/historico-lancamentos")
def listar_historico():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT r.id, r.data_registro::text, r.turno, r.operador, r.maquina_numero,
                   (SELECT COALESCE(SUM(machine_counter),0) FROM result_by_order WHERE turno_id = r.id) as total_mc
            FROM registro_turnos r ORDER BY r.data_registro DESC, r.turno ASC;
        """)
        dados = cursor.fetchall()
        cursor.close()
        conn.close()
        return dados
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/historico-lancamentos/{id}")
def deletar_lancamento(id: int):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM registro_turnos WHERE id = %s;", (id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "removido"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/maquinas")
def adicionar_maquina(m: dict):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO maquinas (numero_maquina, tipo) VALUES (%s, %s);", (m['numero_maquina'], m['tipo']))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/tnos")
def adicionar_tno(t: ModelTNOMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO tipos_tno (nome) VALUES (%s);", (t.nome,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/paradas")
def adicionar_codigo_parada_mestre(p: ModelParadaMestre):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO codigos_parada (tipo_maquina, numero, problema) VALUES (%s, %s, %s);", (p.tipo_maquina, p.numero, p.problema))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/usuarios")
def adicionar_usuario(u: ModelUsuario):
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO usuarios (login, senha, nome, nivel) VALUES (%s, %s, %s, %s);", (u.login, u.senha, u.nome, u.nivel))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "sucesso"}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))
