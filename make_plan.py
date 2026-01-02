import pandas as pd
import datetime

# 1. 2026년 주요 일정 데이터 (부동산 영업용)
holidays_2026 = {
    "2026-01-01": "신정",
    "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
    "2026-03-01": "3.1절", "2026-03-02": "대체공휴일",
    "2026-05-05": "어린이날",
    "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일",
    "2026-06-03": "★지방선거★", 
    "2026-06-06": "현충일",
    "2026-08-15": "광복절", "2026-08-17": "대체공휴일",
    "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴",
    "2026-10-03": "개천절", "2026-10-05": "대체공휴일",
    "2026-10-09": "한글날",
    "2026-12-25": "성탄절"
}

# 2. 데이터 생성
days = list(range(1, 32))
months = list(range(1, 13))
year = 2026
output_data = []
weekday_map = {0: "월", 1: "화", 2: "수", 3: "목", 4: "금", 5: "토", 6: "일"}

for d in days:
    row = {"일": d}
    for m in months:
        try:
            date_obj = datetime.date(year, m, d)
            yoil = weekday_map[date_obj.weekday()]
            date_str = date_obj.strftime("%Y-%m-%d")
            cell_text = f"{yoil}"
            if date_str in holidays_2026:
                cell_text += f"\n{holidays_2026[date_str]}"
            row[f"{m}월"] = cell_text
        except ValueError:
            row[f"{m}월"] = "" 
    output_data.append(row)

df = pd.DataFrame(output_data)
df.set_index("일", inplace=True)

# 3. 엑셀 파일 생성
filename = "2026년_부동산_계획표.xlsx"
with pd.ExcelWriter(filename, engine='xlsxwriter') as writer:
    df.to_excel(writer, sheet_name='2026년')
    workbook = writer.book
    worksheet = writer.sheets['2026년']
    
    # 스타일
    red_fmt = workbook.add_format({'font_color': 'red', 'align': 'center', 'valign': 'vcenter', 'border': 1, 'text_wrap': True})
    blue_fmt = workbook.add_format({'font_color': 'blue', 'align': 'center', 'valign': 'vcenter', 'border': 1, 'text_wrap': True})
    normal_fmt = workbook.add_format({'align': 'center', 'valign': 'vcenter', 'border': 1, 'text_wrap': True})
    
    worksheet.set_column(0, 0, 5)
    worksheet.set_column(1, 12, 12)
    
    for row_num in range(len(df)):
        worksheet.set_row(row_num + 1, 35)
        for col_num in range(len(df.columns)):
            cell_value = df.iloc[row_num, col_num]
            if cell_value == "": continue
            
            if "일" in cell_value[:1] or any(x in cell_value for x in ["선거", "절", "설날", "추석", "신정", "어린이"]):
                worksheet.write(row_num+1, col_num+1, cell_value, red_fmt)
            elif "토" in cell_value[:1]:
                worksheet.write(row_num+1, col_num+1, cell_value, blue_fmt)
            else:
                worksheet.write(row_num+1, col_num+1, cell_value, normal_fmt)

print(f"완료! 같은 폴더에 '{filename}' 파일이 생성되었습니다.")