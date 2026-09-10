import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';

class TeacherScheduleScreen extends StatefulWidget {
  final Color institutionColor;

  const TeacherScheduleScreen({
    super.key,
    required this.institutionColor,
  });

  @override
  State<TeacherScheduleScreen> createState() =>
      _TeacherScheduleScreenState();
}

class _TeacherScheduleScreenState
    extends State<TeacherScheduleScreen> {

  List<dynamic> periods = [];
  bool isLoading = true;

  String institutionId = "";
  String teacherId = "";
  String selectedDate = "";

  List<Map<String, String>> dateDayList = [];

  @override
  void initState() {
    super.initState();
    init();
  }

  Future<void> init() async {
    final user = FirebaseAuth.instance.currentUser;
    teacherId = user!.uid;

    final userDoc = await FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .get();

    institutionId = userDoc.data()?['institutionId'];

    generateDates();
    fetchTimetable();
  }

  void generateDates() {
    final now = DateTime.now();

    dateDayList.clear();

    for (int i = 0; i < 7; i++) {
      final date = now.add(Duration(days: i));

      dateDayList.add({
        "date": date.day.toString().padLeft(2, '0'),
        "fullDate": date.toIso8601String().split("T")[0],
      });
    }

    selectedDate = dateDayList.first['fullDate']!;
  }

  Future<void> fetchTimetable() async {
    setState(() => isLoading = true);

    final snapshot = await FirebaseFirestore.instance
        .collection('timetable')
        .where('institutionId', isEqualTo: institutionId)
        .get();

    List docsForDay = [];

    for (var doc in snapshot.docs) {
      final data = doc.data();

      if (data['date'] == selectedDate) {
        docsForDay.add(data);
      }
    }

    List temp = [];
    bool breakAdded = false;

    for (var data in docsForDay) {
      for (var p in data['periods']) {

        final isBreak = p['type'] == "break";
        final isMine = p['teacherId'] == teacherId;

        if (isMine) {
          if ((p['startTime'] ?? "").toString().isEmpty ||
              (p['endTime'] ?? "").toString().isEmpty) continue;

          temp.add(p);
        }

        if (isBreak && !breakAdded) {
          temp.add(p);
          breakAdded = true;
        }
      }
    }

    temp.sort((a, b) =>
        (a['startTime'] ?? "").compareTo(b['startTime'] ?? ""));

    setState(() {
      periods = temp;
      isLoading = false;
    });
  }

  DateTime? parseTime(String? time) {
    if (time == null || time.isEmpty) return null;

    try {
      final now = DateTime.now();
      final parts = time.split(":");

      return DateTime(
        now.year,
        now.month,
        now.day,
        int.parse(parts[0]),
        int.parse(parts[1]),
      );
    } catch (e) {
      return null;
    }
  }

  String getStatus(int index) {
    final now = DateTime.now();

    for (int i = 0; i < periods.length; i++) {
      final start = parseTime(periods[i]['startTime']);
      final end = parseTime(periods[i]['endTime']);

      if (start == null || end == null) continue;

      if (now.isAfter(start) && now.isBefore(end)) {
        if (i == index) return "now";
      }
    }

    return "";
  }

  String getDate() {
    if (selectedDate.isEmpty) return "";

    try {
      final parsed = DateTime.parse(selectedDate);
      return DateFormat("EEEE · d MMM").format(parsed);
    } catch (e) {
      return "";
    }
  }

  @override
  Widget build(BuildContext context) {

    final primary = widget.institutionColor;

    return Scaffold(
      backgroundColor: primary,

      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            /// HEADER
            Container(
              height: 100, // 👈 fixed header height (same as others)
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              alignment: Alignment.bottomLeft,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  const Text(
                    "My Schedule",
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    getDate(),
                    style: const TextStyle(
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                child: Column(
                  children: [

                    const SizedBox(height: 16),

                    /// PREMIUM DATE BAR
                    SizedBox(
                      height: 70,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: dateDayList.length,
                        itemBuilder: (context, index) {

                          final item = dateDayList[index];
                          final date = DateTime.parse(item['fullDate']!);

                          final isSelected =
                              item['fullDate'] == selectedDate;

                          final dayName =
                          DateFormat('E').format(date);

                          return GestureDetector(
                            onTap: () {
                              setState(() {
                                selectedDate = item['fullDate']!;
                              });
                              fetchTimetable();
                            },
                            child: Container(
                              width: 60,
                              margin: const EdgeInsets.symmetric(horizontal: 6),
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? primary
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(16),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [

                                  Text(
                                    dayName,
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: isSelected
                                          ? Colors.white
                                          : Colors.grey,
                                    ),
                                  ),

                                  const SizedBox(height: 6),

                                  Text(
                                    item['date']!,
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: isSelected
                                          ? Colors.white
                                          : Colors.black,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    const SizedBox(height: 10),

                    /// TIMELINE UI
                    Expanded(
                      child: isLoading
                          ? const Center(child: CircularProgressIndicator())
                          : periods.isEmpty
                          ? const Center(child: Text("No schedule available"))
                          : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: periods.length,
                        itemBuilder: (context, index) {
                          final item = periods[index];
                          return _timelineBlock(
                              item, getStatus(index));
                        },
                      ),
                    ),
                  ],
                ),
              ),
            )
          ],
        ),
      ),
    );
  }

  /// TIMELINE BLOCK (MATCH ADMIN)
  Widget _timelineBlock(Map item, String status) {

    final isBreak = item['type'] == "break";

    Color bg = Colors.grey.shade100;

    if (isBreak) bg = Colors.orange.withValues(alpha: 0.2);
    if (status == "now") bg = Colors.green.withValues(alpha: 0.2);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [

          Column(
            children: [
              Text(item['startTime'],
                  style: const TextStyle(fontSize: 12)),
              const SizedBox(height: 4),
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: isBreak ? Colors.orange : Colors.grey,
                  shape: BoxShape.circle,
                ),
              ),
              Container(
                width: 2,
                height: 60,
                color: Colors.grey.shade300,
              ),
            ],
          ),

          const SizedBox(width: 12),

          Expanded(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item['subject'],
                      style: const TextStyle(
                          fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text("${item['startTime']} - ${item['endTime']}"),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}